// Brume Earn: USDC in vault 1 of the wallet's Smart Account, supplied to Kamino; the automation key can only deposit or withdraw inside vault 1.
import {
  KAMINO_MAIN_MARKET,
  getKaminoUsdcEarnTargetForCluster,
  getStablecoinMintForCluster,
  Stablecoin,
  type LoyalCluster,
} from "@loyal-labs/actions";
import { pda } from "@loyal-labs/loyal-smart-accounts";
import { createSmartAccountVaultsClient } from "@loyal-labs/smart-account-vaults";
import { Keypair, PublicKey, type Connection } from "@solana/web3.js";
import type { NetworkId } from "@/shared/constants";
import type { PriorityLevel } from "@/shared/priority-fee";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@/shared/spl-token-inline";
import { ensureBrumeSettings, resolveBrumeSettings } from "./brume-vault";
import { sendPreparedInOrder } from "./tx-send";

export const EARN_VAULT_INDEX = 1;
export const USDC_DECIMALS = 6;

const STORAGE_KEY = "brume_earn_v1";

// Kamino reserve layout offsets (after the 8-byte discriminator) used to value collateral.
const RESERVE = {
  liquidityAvailableAmount: 8 + 216,
  liquidityBorrowedAmountSf: 8 + 224,
  accumulatedProtocolFeesSf: 8 + 336,
  accumulatedReferrerFeesSf: 8 + 352,
  pendingReferrerFeesSf: 8 + 368,
  collateralMintTotalSupply: 8 + 2584,
} as const;
const FRACTION_BITS = 60n;

// Kamino obligation deposits start at byte 96; each entry is 136 bytes: reserve (32) then deposited amount (u64).
const OBLIGATION_DEPOSITS_OFFSET = 8 + 8 + 16 + 32 + 32;
const OBLIGATION_COLLATERAL_SIZE = 136;
const OBLIGATION_MAX_DEPOSITS = 8;

export type EarnPolicyRecord = {
  account: string;
  seed: string;
  setupAccount?: string;
  setupSeed?: string;
};

export type EarnRecord = {
  // Automation key: policy signer only, never a root signer.
  automationSecret: number[];
  policy?: EarnPolicyRecord;
  // Net USDC put into Earn (deposits and auto-earn pulls minus withdrawals), used to show earned yield.
  principalRaw?: string;
  // Pinned during staged auto-earn setup so a resumed setup derives the same accounts.
  autodepositSetup?: { nonce: string; policySeed?: string };
  autodeposit?: {
    policy: string;
    recurringDelegation: string;
    floorRaw: string;
    perPeriodCapRaw: string;
    periodSeconds: string;
    enabled: boolean;
  };
};

export type EarnPosition = {
  settings: string | null;
  vault: string | null;
  automationKey: string;
  // USDC in the Earn vault that is not yet supplied to Kamino.
  idleRaw: string;
  // USDC value of the Kamino supply position.
  suppliedRaw: string;
  totalRaw: string;
  // Total minus net principal; null when this device has no principal record.
  earnedRaw: string | null;
  walletUsdcRaw: string;
  supplyApy: number | null;
  hasPolicy: boolean;
};

function key(network: NetworkId, owner: PublicKey): string {
  return `${network}:${owner.toBase58()}`;
}

async function readAll(): Promise<Record<string, EarnRecord>> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const v = raw[STORAGE_KEY];
  return v && typeof v === "object" ? (v as Record<string, EarnRecord>) : {};
}

export async function readEarnRecord(network: NetworkId, owner: PublicKey): Promise<EarnRecord | null> {
  return (await readAll())[key(network, owner)] ?? null;
}

export async function writeEarnRecord(network: NetworkId, owner: PublicKey, rec: EarnRecord): Promise<void> {
  const all = await readAll();
  all[key(network, owner)] = rec;
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

// The wallet's Earn record with its automation key, created on first use.
export async function ensureEarnRecord(network: NetworkId, owner: PublicKey): Promise<EarnRecord> {
  const existing = await readEarnRecord(network, owner);
  if (existing) return existing;
  const rec: EarnRecord = { automationSecret: [...Keypair.generate().secretKey] };
  await writeEarnRecord(network, owner, rec);
  return rec;
}

export function automationKeypair(rec: EarnRecord): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(rec.automationSecret));
}

export function cluster(network: NetworkId): LoyalCluster {
  return network as LoyalCluster;
}

export function earnClient(conn: Connection) {
  return createSmartAccountVaultsClient({ connection: conn });
}

export function earnVaultPda(settings: PublicKey): PublicKey {
  return pda.getSmartAccountPda({ settingsPda: settings, accountIndex: EARN_VAULT_INDEX })[0];
}

export function usdcMint(network: NetworkId): PublicKey {
  return getStablecoinMintForCluster(cluster(network), Stablecoin.USDC);
}

function readU64(d: Uint8Array, o: number): bigint {
  return new DataView(d.buffer, d.byteOffset + o, 8).getBigUint64(0, true);
}

function readU128(d: Uint8Array, o: number): bigint {
  return readU64(d, o) + (readU64(d, o + 8) << 64n);
}

// Raw USDC that `collateralRaw` cTokens redeem for at the reserve's current rate.
export function collateralToLiquidity(reserveData: Uint8Array, collateralRaw: bigint): bigint {
  if (collateralRaw <= 0n) return 0n;
  const supply = readU64(reserveData, RESERVE.collateralMintTotalSupply);
  const gross =
    (readU64(reserveData, RESERVE.liquidityAvailableAmount) << FRACTION_BITS) +
    readU128(reserveData, RESERVE.liquidityBorrowedAmountSf);
  const fees =
    readU128(reserveData, RESERVE.accumulatedProtocolFeesSf) +
    readU128(reserveData, RESERVE.accumulatedReferrerFeesSf) +
    readU128(reserveData, RESERVE.pendingReferrerFeesSf);
  const total = gross > fees ? gross - fees : 0n;
  if (supply === 0n || total === 0n) return collateralRaw;
  return (collateralRaw * total) / (supply << FRACTION_BITS);
}

// Collateral deposited for `reserve` in a Kamino obligation account.
export function obligationCollateral(obligationData: Uint8Array, reserve: PublicKey): bigint {
  const want = reserve.toBytes();
  for (let i = 0; i < OBLIGATION_MAX_DEPOSITS; i++) {
    const o = OBLIGATION_DEPOSITS_OFFSET + i * OBLIGATION_COLLATERAL_SIZE;
    if (o + 40 > obligationData.length) break;
    const r = obligationData.subarray(o, o + 32);
    if (r.every((b, j) => b === want[j])) return readU64(obligationData, o + 32);
  }
  return 0n;
}

async function tokenBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getAccountInfo(ata, "confirmed");
  if (!info) return 0n;
  return BigInt((await conn.getTokenAccountBalance(ata, "confirmed")).value.amount);
}

// cTokens held in vault token accounts; a mint whose authority is the market "lma" PDA is collateral of this market.
async function vaultCollateralInAta(
  conn: Connection,
  vault: PublicKey,
  market: PublicKey,
  lendProgramId: PublicKey,
): Promise<bigint> {
  const lma = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("lma"), market.toBytes()],
    lendProgramId,
  )[0].toBase58();
  const accounts = await conn.getParsedTokenAccountsByOwner(vault, { programId: TOKEN_PROGRAM_ID }, "confirmed");
  let total = 0n;
  for (const { account } of accounts.value) {
    const info = (account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string } } } })
      .parsed?.info;
    if (!info?.mint || !info.tokenAmount?.amount || info.tokenAmount.amount === "0") continue;
    const mintInfo = await conn.getParsedAccountInfo(new PublicKey(info.mint), "confirmed");
    const authority = (mintInfo.value?.data as { parsed?: { info?: { mintAuthority?: string } } } | undefined)
      ?.parsed?.info?.mintAuthority;
    if (authority === lma) total += BigInt(info.tokenAmount.amount);
  }
  return total;
}

export async function fetchSupplyApy(network: NetworkId): Promise<number | null> {
  if (network !== "mainnet-beta") return null;
  try {
    const target = getKaminoUsdcEarnTargetForCluster(cluster(network));
    const res = await fetch(
      `https://api.kamino.finance/kamino-market/${KAMINO_MAIN_MARKET.toBase58()}/reserves/metrics?env=mainnet-beta`,
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { reserve?: string; supplyApy?: string }[];
    const row = rows.find((r) => r.reserve === target.reserve.toBase58());
    const apy = row?.supplyApy != null ? Number(row.supplyApy) : NaN;
    return Number.isFinite(apy) ? apy : null;
  } catch {
    return null;
  }
}

export async function fetchEarnPosition(params: {
  conn: Connection;
  network: NetworkId;
  owner: PublicKey;
}): Promise<EarnPosition> {
  const { conn, network, owner } = params;
  const rec = await ensureEarnRecord(network, owner);
  const target = getKaminoUsdcEarnTargetForCluster(cluster(network));
  const mint = usdcMint(network);
  const walletUsdc = tokenBalance(conn, getAssociatedTokenAddressSync(mint, owner, TOKEN_PROGRAM_ID));
  const apy = fetchSupplyApy(network);
  const settings = await resolveBrumeSettings({ conn, network, owner, discover: false });

  let idle = 0n;
  let supplied = 0n;
  let vault: PublicKey | null = null;
  if (settings) {
    vault = earnVaultPda(settings);
    const obligation = PublicKey.findProgramAddressSync(
      [Uint8Array.of(0), Uint8Array.of(0), vault.toBytes(), target.market.toBytes(),
        PublicKey.default.toBytes(), PublicKey.default.toBytes()],
      target.lendProgramId,
    )[0];
    const [idleRaw, reserveInfo, obligationInfo, ataCollateral] = await Promise.all([
      tokenBalance(conn, getAssociatedTokenAddressSync(mint, vault, TOKEN_PROGRAM_ID)),
      conn.getAccountInfo(target.reserve, "confirmed"),
      conn.getAccountInfo(obligation, "confirmed"),
      vaultCollateralInAta(conn, vault, target.market, target.lendProgramId),
    ]);
    idle = idleRaw;
    const collateral =
      ataCollateral + (obligationInfo ? obligationCollateral(obligationInfo.data, target.reserve) : 0n);
    if (reserveInfo && collateral > 0n) supplied = collateralToLiquidity(reserveInfo.data, collateral);
  }

  return {
    settings: settings?.toBase58() ?? null,
    vault: vault?.toBase58() ?? null,
    automationKey: automationKeypair(rec).publicKey.toBase58(),
    idleRaw: idle.toString(),
    suppliedRaw: supplied.toString(),
    totalRaw: (idle + supplied).toString(),
    earnedRaw:
      rec.principalRaw != null
        ? (idle + supplied > BigInt(rec.principalRaw) ? idle + supplied - BigInt(rec.principalRaw) : 0n).toString()
        : null,
    walletUsdcRaw: (await walletUsdc).toString(),
    supplyApy: await apy,
    hasPolicy: rec.policy != null,
  };
}

function policyArgs(rec: EarnRecord) {
  if (!rec.policy) return undefined;
  return {
    account: new PublicKey(rec.policy.account),
    seed: BigInt(rec.policy.seed),
    setupPolicy:
      rec.policy.setupAccount && rec.policy.setupSeed
        ? { account: new PublicKey(rec.policy.setupAccount), seed: BigInt(rec.policy.setupSeed) }
        : null,
  };
}

// Wallet USDC to Earn vault to Kamino; the first deposit also creates the Earn policy.
export async function earnDeposit(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  amountRaw: bigint;
  priority?: PriorityLevel;
}): Promise<{ signatures: string[] }> {
  const { conn, network, from, amountRaw } = params;
  if (amountRaw <= 0n) throw new Error("Amount must be positive");
  const owner = from.publicKey;
  const settingsPda = await ensureBrumeSettings({ conn, network, from, priority: params.priority });
  const rec = await ensureEarnRecord(network, owner);
  const existing = policyArgs(rec);

  const res = await earnClient(conn).prepareEarnUsdcDeposit({
    settingsPda,
    walletAddress: owner,
    policySigner: automationKeypair(rec).publicKey,
    feePayer: owner,
    amountRaw,
    cluster: cluster(network),
    initializeYieldRoutingPolicy: !existing,
    ...(existing ? { yieldRoutingPolicy: existing } : {}),
  });

  const signatures = await sendPreparedInOrder({
    conn,
    network,
    signers: [from],
    operations: [res.policySetupPrepared, res.policyFinalizePrepared, res.prepared],
    priority: params.priority,
  });

  rec.principalRaw = (BigInt(rec.principalRaw ?? "0") + amountRaw).toString();
  if (!existing) {
    rec.policy = {
      account: res.policy.account.toBase58(),
      seed: res.policy.seed.toString(),
      ...(res.setupPolicy
        ? { setupAccount: res.setupPolicy.account.toBase58(), setupSeed: res.setupPolicy.seed.toString() }
        : {}),
    };
  }
  await writeEarnRecord(network, owner, rec);
  return { signatures };
}

// Kamino to Earn vault to wallet; `full` redeems the whole position.
export async function earnWithdraw(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  amountRaw: bigint;
  mode: "partial" | "full";
  priority?: PriorityLevel;
}): Promise<{ signatures: string[] }> {
  const { conn, network, from } = params;
  const owner = from.publicKey;
  const settingsPda = await resolveBrumeSettings({ conn, network, owner, discover: true });
  if (!settingsPda) throw new Error("No Earn position");
  const rec = await ensureEarnRecord(network, owner);
  // A full exit takes the whole position from chain; the partial path keeps the Earn policy that auto-earn needs.
  const amountRaw =
    params.mode === "full"
      ? BigInt((await fetchEarnPosition({ conn, network, owner })).totalRaw)
      : params.amountRaw;
  if (amountRaw <= 0n) throw new Error(params.mode === "full" ? "No Earn position" : "Amount must be positive");
  const policy = policyArgs(rec);
  const res = await earnClient(conn).prepareEarnUsdcWithdraw({
    settingsPda,
    walletAddress: owner,
    policySigner: automationKeypair(rec).publicKey,
    feePayer: owner,
    amountRaw,
    cluster: cluster(network),
    mode: "partial",
    ...(policy ? { yieldRoutingPolicy: policy } : {}),
  });
  const signatures = await sendPreparedInOrder({
    conn,
    network,
    signers: [from],
    operations: [res.prepared],
    priority: params.priority,
  });
  const principal = BigInt(rec.principalRaw ?? "0");
  rec.principalRaw = (params.mode === "full" || amountRaw >= principal ? 0n : principal - amountRaw).toString();
  await writeEarnRecord(network, owner, rec);
  return { signatures };
}
