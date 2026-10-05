// Shield / unshield through a Loyal Smart Account vault (Squads Smart Account Program).
//
// Shield   = move SOL/SPL from the wallet into vault index 0 of a 1-of-1 Smart Account
//            whose only signer is the wallet key (created on first shield, time lock 0).
// Unshield = executeTransactionSync moves funds from the vault back to the wallet.
//
// The wallet key stays the root signer; the Settings PDA never holds funds.
import {
  PROGRAM_ID,
  accounts,
  codecs,
  generated,
  pda,
} from "@loyal-labs/loyal-smart-accounts";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { encodeBase58 } from "@/shared/base58";
import { SOL_WRAPPED_MINT, type NetworkId } from "@/shared/constants";
import type { PriorityLevel } from "@/shared/priority-fee";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  tokenProgramPubkey,
} from "@/shared/spl-token-inline";
import { applyPriorityFee } from "./priority-fee";

export const LOYAL_VAULT_ACCOUNT_INDEX = 0;

const STORAGE_KEY = "brume_loyal_vault_v1";

// Byte offset of signers[0].key in a Settings account (archivalAuthority is stored as a
// fixed 33-byte option on-chain; verified against devnet). Used only to rediscover the
// Settings PDA if local storage was cleared; every hit is decoded and checked.
const SETTINGS_FIRST_SIGNER_OFFSET =
  8 + 16 + 32 + 2 + 4 + 8 + 8 + 33 + 8 + 1 + 4;

export type LoyalVaultBalances = Record<string, string>;

export type LoyalVaultTransferResult = {
  signature: string;
  settingsPda: string;
  vaultPda: string;
};

type MintInfo = { decimals: number; programId: PublicKey };

const discoveryAttempted = new Set<string>();

function storageKey(network: NetworkId, owner: string): string {
  return `${network}:${owner}`;
}

async function readSettingsMap(): Promise<Record<string, string>> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const v = raw[STORAGE_KEY];
  return v && typeof v === "object" ? (v as Record<string, string>) : {};
}

async function writeSettingsAddress(
  network: NetworkId,
  owner: string,
  settings: string,
): Promise<void> {
  const map = await readSettingsMap();
  map[storageKey(network, owner)] = settings;
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

export function loyalVaultPdaFor(settingsPda: PublicKey): PublicKey {
  const [vault] = pda.getSmartAccountPda({
    settingsPda,
    accountIndex: LOYAL_VAULT_ACCOUNT_INDEX,
  });
  return vault;
}

async function ownedSettingsSeed(
  conn: Connection,
  settingsPda: PublicKey,
  owner: PublicKey,
): Promise<bigint | null> {
  try {
    const s = await accounts.Settings.fromAccountAddress(conn, settingsPda, "confirmed");
    return s.signers.some((m) => m.key.equals(owner)) ? BigInt(s.seed.toString()) : null;
  } catch {
    return null;
  }
}

async function isOwnedSettings(
  conn: Connection,
  settingsPda: PublicKey,
  owner: PublicKey,
): Promise<boolean> {
  return (await ownedSettingsSeed(conn, settingsPda, owner)) != null;
}

async function discoverSettingsOnChain(
  conn: Connection,
  owner: PublicKey,
): Promise<PublicKey | null> {
  const hits = await conn.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    dataSlice: { offset: 0, length: 0 },
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: encodeBase58(Uint8Array.from(accounts.settingsDiscriminator)),
        },
      },
      { memcmp: { offset: SETTINGS_FIRST_SIGNER_OFFSET, bytes: owner.toBase58() } },
    ],
  });
  // Several matches can exist; the oldest (lowest seed) is the canonical one.
  let best: { pubkey: PublicKey; seed: bigint } | null = null;
  for (const h of hits) {
    const seed = await ownedSettingsSeed(conn, h.pubkey, owner);
    if (seed != null && (!best || seed < best.seed)) best = { pubkey: h.pubkey, seed };
  }
  return best?.pubkey ?? null;
}

/** Stored Settings PDA for this wallet, falling back to an on-chain lookup. */
export async function resolveLoyalSettings(params: {
  conn: Connection;
  network: NetworkId;
  owner: PublicKey;
  discover?: boolean;
}): Promise<PublicKey | null> {
  const ownerB58 = params.owner.toBase58();
  const stored = (await readSettingsMap())[storageKey(params.network, ownerB58)];
  if (stored) return new PublicKey(stored);
  if (!params.discover) return null;
  const found = await discoverSettingsOnChain(params.conn, params.owner).catch(() => null);
  if (found) await writeSettingsAddress(params.network, ownerB58, found.toBase58());
  return found;
}

async function readMint(conn: Connection, mint: PublicKey): Promise<MintInfo> {
  const info = await conn.getParsedAccountInfo(mint, "confirmed");
  const v = info.value;
  if (!v) throw new Error("Mint not found");
  if (!v.owner.equals(TOKEN_PROGRAM_ID) && !v.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("Not an SPL token mint");
  }
  const data = v.data;
  if (!("parsed" in data) || data.parsed.type !== "mint") {
    throw new Error("Could not read mint");
  }
  const decimals = (data.parsed.info as { decimals?: number }).decimals;
  if (typeof decimals !== "number") throw new Error("Invalid mint decimals");
  return {
    decimals,
    programId: v.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? tokenProgramPubkey("token-2022")
      : tokenProgramPubkey("token"),
  };
}

export function parseTokenAmount(amountStr: string, decimals: number): bigint {
  const t = amountStr.trim().replace(/,/g, "");
  const m = t.match(/^(\d*)(?:\.(\d+))?$/);
  if (!t || t === "." || !m) throw new Error("Invalid amount");
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  const out = BigInt(m[1] || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  if (out <= 0n) throw new Error("Amount must be positive");
  return out;
}

async function sendAndConfirm(
  conn: Connection,
  network: NetworkId,
  signer: Keypair,
  ixs: TransactionInstruction[],
  priority?: PriorityLevel,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer.publicKey, recentBlockhash: blockhash }).add(
    ...ixs,
  );
  await applyPriorityFee({ conn, network, tx, level: priority });
  tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  const res = await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (res.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  }
  return sig;
}

async function buildCreateSettingsIx(
  conn: Connection,
  owner: PublicKey,
): Promise<{ settingsPda: PublicKey; ix: TransactionInstruction }> {
  const [configPda] = pda.getProgramConfigPda({});
  const config = await accounts.ProgramConfig.fromAccountAddress(conn, configPda, "confirmed");
  const nextIndex = BigInt(config.smartAccountIndex.toString()) + 1n;
  const [settingsPda] = pda.getSettingsPda({ accountIndex: nextIndex });
  // Same accounts/args as the SDK's smartAccounts create builder (settings PDA goes in
  // remaining accounts); called through `generated` because the feature typings don't resolve.
  const ix = generated.createCreateSmartAccountInstruction(
    {
      programConfig: configPda,
      treasury: config.treasury,
      creator: owner,
      program: PROGRAM_ID,
      anchorRemainingAccounts: [{ pubkey: settingsPda, isSigner: false, isWritable: true }],
    },
    {
      args: {
        settingsAuthority: null,
        threshold: 1,
        signers: [{ key: owner, permissions: codecs.Permissions.all() }],
        timeLock: 0,
        rentCollector: null,
        memo: "brume-vault",
      },
    },
    PROGRAM_ID,
  );
  return { settingsPda, ix };
}

/** True when the Settings PDA we derived was taken by another creator before our tx landed. */
async function settingsIndexWasTaken(
  conn: Connection,
  settingsPda: PublicKey,
  owner: PublicKey,
): Promise<boolean> {
  const info = await conn.getAccountInfo(settingsPda, "confirmed").catch(() => null);
  return info != null && !(await isOwnedSettings(conn, settingsPda, owner));
}

/** One RPC call per token program; returns raw balances keyed by mint (SOL under SOL_WRAPPED_MINT). */
export async function fetchLoyalVaultBalances(params: {
  conn: Connection;
  network: NetworkId;
  owner: PublicKey;
}): Promise<LoyalVaultBalances> {
  // getProgramAccounts is heavy; do the on-chain lookup at most once per wallet per session.
  const key = storageKey(params.network, params.owner.toBase58());
  const discover = !discoveryAttempted.has(key);
  discoveryAttempted.add(key);
  const settings = await resolveLoyalSettings({ ...params, discover });
  if (!settings) return {};
  const vault = loyalVaultPdaFor(settings);
  const [lamports, legacy, t22] = await Promise.all([
    params.conn.getBalance(vault, "confirmed"),
    params.conn.getParsedTokenAccountsByOwner(vault, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
    params.conn.getParsedTokenAccountsByOwner(
      vault,
      { programId: TOKEN_2022_PROGRAM_ID },
      "confirmed",
    ),
  ]);
  const out: LoyalVaultBalances = { [SOL_WRAPPED_MINT]: String(lamports) };
  for (const { account } of [...legacy.value, ...t22.value]) {
    const info = (account.data as { parsed?: { info?: Record<string, unknown> } }).parsed?.info;
    const mint = typeof info?.mint === "string" ? info.mint : null;
    const amount = (info?.tokenAmount as { amount?: string } | undefined)?.amount;
    if (!mint || !amount) continue;
    out[mint] = (BigInt(out[mint] ?? "0") + BigInt(amount)).toString();
  }
  return out;
}

export async function fetchLoyalVaultBalance(params: {
  conn: Connection;
  network: NetworkId;
  owner: PublicKey;
  mintAddress: string;
}): Promise<string> {
  const all = await fetchLoyalVaultBalances(params);
  return all[params.mintAddress] ?? "0";
}

/** Shield: wallet -> Loyal vault. Creates the Smart Account in the same tx on first use. */
export async function loyalShield(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  priority?: PriorityLevel;
}): Promise<LoyalVaultTransferResult> {
  const { conn, network, from } = params;
  const owner = from.publicKey;
  const isSol = params.mintAddress === SOL_WRAPPED_MINT;
  const mint = new PublicKey(params.mintAddress);
  const mintInfo = isSol ? null : await readMint(conn, mint);
  const amount = parseTokenAmount(params.amountStr, isSol ? 9 : mintInfo!.decimals);

  const existing = await resolveLoyalSettings({ conn, network, owner, discover: true });

  for (let attempt = 0; attempt < 3; attempt++) {
    const ixs: TransactionInstruction[] = [];
    let settingsPda = existing;
    if (!settingsPda) {
      const created = await buildCreateSettingsIx(conn, owner);
      settingsPda = created.settingsPda;
      ixs.push(created.ix);
    }
    const vault = loyalVaultPdaFor(settingsPda);

    if (isSol) {
      const current = BigInt(await conn.getBalance(vault, "confirmed"));
      const rentMin = BigInt(await conn.getMinimumBalanceForRentExemption(0));
      if (current + amount < rentMin) {
        throw new Error(
          `First SOL shield must be at least ${Number(rentMin) / LAMPORTS_PER_SOL} SOL (vault rent minimum)`,
        );
      }
      ixs.push(SystemProgram.transfer({ fromPubkey: owner, toPubkey: vault, lamports: amount }));
    } else {
      const { decimals, programId } = mintInfo!;
      const src = getAssociatedTokenAddressSync(mint, owner, programId);
      const dst = getAssociatedTokenAddressSync(mint, vault, programId);
      const bal = await conn.getTokenAccountBalance(src, "confirmed").catch(() => null);
      if (!bal || BigInt(bal.value.amount) < amount) {
        throw new Error("Insufficient token balance");
      }
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(owner, dst, vault, mint, programId),
        createTransferCheckedInstruction(src, mint, dst, owner, amount, decimals, programId),
      );
    }

    try {
      const signature = await sendAndConfirm(conn, network, from, ixs, params.priority);
      if (!existing) {
        await writeSettingsAddress(network, owner.toBase58(), settingsPda.toBase58());
      }
      return {
        signature,
        settingsPda: settingsPda.toBase58(),
        vaultPda: vault.toBase58(),
      };
    } catch (e) {
      // Another wallet took the same global Smart Account index; derive the next one.
      if (!existing && attempt < 2 && (await settingsIndexWasTaken(conn, settingsPda, owner))) {
        continue;
      }
      throw e;
    }
  }
  throw new Error("Could not create Loyal Smart Account");
}

/** Vault -> destination via executeTransactionSync, signed by the wallet (sole signer). */
export async function loyalVaultTransferOut(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  toAddress?: string;
  priority?: PriorityLevel;
}): Promise<LoyalVaultTransferResult> {
  const { conn, network, from } = params;
  const owner = from.publicKey;
  const settingsPda = await resolveLoyalSettings({ conn, network, owner, discover: true });
  if (!settingsPda) throw new Error("No shielded balance");
  const vault = loyalVaultPdaFor(settingsPda);
  const dest = params.toAddress ? new PublicKey(params.toAddress.trim()) : owner;
  const isSol = params.mintAddress === SOL_WRAPPED_MINT;
  const mint = new PublicKey(params.mintAddress);

  const outer: TransactionInstruction[] = [];
  let inner: TransactionInstruction;

  if (isSol) {
    const amount = parseTokenAmount(params.amountStr, 9);
    const have = BigInt(await conn.getBalance(vault, "confirmed"));
    if (have < amount) throw new Error("Insufficient shielded balance");
    const left = have - amount;
    const rentMin = BigInt(await conn.getMinimumBalanceForRentExemption(0));
    if (left > 0n && left < rentMin) {
      throw new Error(
        `Leave 0 or at least ${Number(rentMin) / LAMPORTS_PER_SOL} SOL in the vault (rent minimum)`,
      );
    }
    if (!dest.equals(owner)) {
      const destBal = BigInt(await conn.getBalance(dest, "confirmed"));
      if (destBal === 0n && amount < rentMin) {
        throw new Error(
          `Recipient has no SOL; send at least ${Number(rentMin) / LAMPORTS_PER_SOL} SOL`,
        );
      }
    }
    inner = SystemProgram.transfer({ fromPubkey: vault, toPubkey: dest, lamports: amount });
  } else {
    const { decimals, programId } = await readMint(conn, mint);
    const amount = parseTokenAmount(params.amountStr, decimals);
    const src = getAssociatedTokenAddressSync(mint, vault, programId);
    const dst = getAssociatedTokenAddressSync(mint, dest, programId);
    const bal = await conn.getTokenAccountBalance(src, "confirmed").catch(() => null);
    if (!bal || BigInt(bal.value.amount) < amount) {
      throw new Error("Insufficient shielded balance");
    }
    // ATA rent is paid by the wallet in the outer tx, so the vault only moves tokens.
    outer.push(createAssociatedTokenAccountIdempotentInstruction(owner, dst, dest, mint, programId));
    inner = createTransferCheckedInstruction(src, mint, dst, vault, amount, decimals, programId);
    // The sync-message compiler needs a writable signer; the vault is the only signer here.
    inner.keys = inner.keys.map((k) => (k.pubkey.equals(vault) ? { ...k, isWritable: true } : k));
  }

  const { instructions, accounts: instructionAccounts } =
    codecs.instructionsToSynchronousTransactionDetails({
      vaultPda: vault,
      members: [owner],
      transaction_instructions: [inner],
    });

  outer.push(
    generated.createExecuteTransactionSyncInstruction(
      {
        consensusAccount: settingsPda,
        program: PROGRAM_ID,
        anchorRemainingAccounts: instructionAccounts,
      },
      {
        args: {
          accountIndex: LOYAL_VAULT_ACCOUNT_INDEX,
          numSigners: 1,
          instructions,
        },
      },
      PROGRAM_ID,
    ),
  );

  const signature = await sendAndConfirm(conn, network, from, outer, params.priority);
  return { signature, settingsPda: settingsPda.toBase58(), vaultPda: vault.toBase58() };
}
