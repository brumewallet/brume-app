import { Buffer } from "buffer";
import { verifyTeeRpcIntegrity } from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import {
  NETWORKS,
  SOL_BASE_UNITS_PER_SOL,
  SOL_WRAPPED_MINT,
  magicblockPerEphemeralAuthHttp,
  magicblockPerEphemeralSkipTeeIntegrityVerify,
  magicblockPerEphemeralSubmitHttp,
  type NetworkId,
} from "@/shared/constants";
import {
  detailedTransactionFailureMessage,
  serializeUnknownForLog,
} from "@/shared/errors";
import { base64ToBytes } from "@/shared/crypto";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  tokenProgramPubkey,
  type TokenProgramKind,
} from "@/shared/spl-token-inline";
import { fetchBrumePerTransferUnsigned } from "./api-client";
import { getPerAuthToken } from "./per-auth";
import {
  paymentsGetIsMintInitialized,
  paymentsGetPrivateBalance,
  paymentsGetSplBalance,
  paymentsPostInitializeMint,
  paymentsPostSplDeposit,
  paymentsPostSplTransfer,
  paymentsPostSplWithdraw,
  type UnsignedPaymentTransaction,
} from "./payments-api";

// MagicBlock Payments API returns legacy transactions; PER submits need TEE auth + Bearer token.

function formatTeeIntegrityFailure(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message;
    if (m === "[object Object]" || m.includes("[object Object]")) {
      return (
        "PER /quote returned a non-string error (SDK bug). " +
        "On devnet, enable skip via magicblockPerEphemeralSkipTeeIntegrityVerify."
      );
    }
    return m;
  }
  if (e !== null && typeof e === "object") {
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

function amountToApiNumber(raw: bigint): number {
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Amount too large");
  }
  return Number(raw);
}

// PER HTTP RPC with session token (/auth/challenge, /auth/login) + submit URL (may differ on devnet).
async function ephemeralAuthedConnection(
  network: NetworkId,
  signer: Keypair,
): Promise<Connection> {
  const rpcUrl = magicblockPerEphemeralSubmitHttp(network).replace(/\/+$/, "");
  const authUrl = magicblockPerEphemeralAuthHttp(network);
  if (magicblockPerEphemeralSkipTeeIntegrityVerify(network)) {
    console.warn(
      "[Brume] Skipping verifyTeeRpcIntegrity on devnet (PER /quote + TEE pipeline); using PER /auth only.",
    );
  } else {
    try {
      const ok = await verifyTeeRpcIntegrity(rpcUrl);
      if (!ok) throw new Error("Ephemeral RPC integrity check returned false");
    } catch (e) {
      throw new Error(
        `Ephemeral RPC integrity check failed: ${formatTeeIntegrityFailure(e)}`,
      );
    }
  }
  const { token } = await getPerAuthToken(
    authUrl,
    signer.publicKey,
    async (message) => nacl.sign.detached(message, signer.secretKey),
  );
  return new Connection(rpcUrl, {
    commitment: "confirmed",
    httpHeaders: { Authorization: `Bearer ${token}` },
  });
}

// Sign wallet-owned keys on API-built legacy tx; send to base or ephemeral per unsigned.sendTo.
async function signAndSendLegacyPaymentTransaction(params: {
  network: NetworkId;
  rpcUrlOverride?: string | null;
  signer: Keypair;
  unsigned: UnsignedPaymentTransaction;
  // When the Payments API omits sendTo (some PER private paths).
  defaultSendToWhenMissing?: "base" | "ephemeral";
}): Promise<string> {
  const wire = base64ToBytes(params.unsigned.transactionBase64);
  const tx = Transaction.from(wire);
  tx.partialSign(params.signer);
  const raw = tx.serialize();

  const sendTo =
    params.unsigned.sendTo ??
    params.defaultSendToWhenMissing ??
    "base";

  // Devnet shield / PER flows move as fast as the rollup; waiting for "confirmed" delays
  // success and lets a stale Brume indexer win over fresh RPC reads. Use processed there.
  const confirmCommitment =
    params.network === "devnet" ? "processed" : "confirmed";

  let rpcForLogs: Connection | null = null;

  try {
    if (sendTo === "ephemeral") {
      rpcForLogs = await ephemeralAuthedConnection(params.network, params.signer);
      // ER / PER: preflight simulation often fails even when the tx is valid on the rollup.
      const sig = await rpcForLogs.sendRawTransaction(raw, {
        skipPreflight: true,
        maxRetries: 3,
        preflightCommitment: confirmCommitment,
      });
      await rpcForLogs.confirmTransaction(
        {
          signature: sig,
          blockhash: params.unsigned.recentBlockhash,
          lastValidBlockHeight: params.unsigned.lastValidBlockHeight,
        },
        confirmCommitment,
      );
      return sig;
    }

    rpcForLogs = getConnection(params.network, params.rpcUrlOverride);
    const sig = await rpcForLogs.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: confirmCommitment,
    });
    await rpcForLogs.confirmTransaction(
      {
        signature: sig,
        blockhash: params.unsigned.recentBlockhash,
        lastValidBlockHeight: params.unsigned.lastValidBlockHeight,
      },
      confirmCommitment,
    );
    return sig;
  } catch (e) {
    const message = await detailedTransactionFailureMessage(e, rpcForLogs);
    const logPayload = {
      sendTo,
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride ?? null,
      unsignedKind: params.unsigned.kind,
      instructionCount: params.unsigned.instructionCount,
      recentBlockhash: params.unsigned.recentBlockhash,
      lastValidBlockHeight: params.unsigned.lastValidBlockHeight,
      feePayer: params.signer.publicKey.toBase58(),
      error: serializeUnknownForLog(e),
      detailedMessage: message,
    };
    console.error(
      `[Brume] MagicBlock Payments transaction failed\n${JSON.stringify(logPayload, null, 2)}`,
    );
    throw new Error(message);
  }
}

async function sendRawTransactionWithDetailedLogs(
  conn: Connection,
  raw: Uint8Array,
  blockhash: string,
  lastValidBlockHeight: number,
  sendOpts: {
    skipPreflight?: boolean;
    maxRetries?: number;
    preflightCommitment?: "confirmed" | "finalized" | "processed";
  },
  logContext: Record<string, unknown>,
): Promise<string> {
  try {
    const sig = await conn.sendRawTransaction(raw, sendOpts);
    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return sig;
  } catch (e) {
    const message = await detailedTransactionFailureMessage(e, conn);
    const logPayload = {
      ...logContext,
      error: serializeUnknownForLog(e),
      detailedMessage: message,
    };
    console.error(
      `[Brume] Transaction failed\n${JSON.stringify(logPayload, null, 2)}`,
    );
    throw new Error(message);
  }
}

// Posts initialize-mint once if is-mint-initialized is false (required before deposit/transfer).
async function ensurePaymentsMintInitializedForSpl(p: {
  mintAddress: string;
  network: NetworkId;
  payerB58: string;
  signer: Keypair;
  rpcUrlOverride?: string | null;
}): Promise<void> {
  const ok = await paymentsGetIsMintInitialized(
    p.mintAddress,
    p.network,
    p.rpcUrlOverride,
  );
  if (ok) return;
  const initUnsigned = await paymentsPostInitializeMint({
    payer: p.payerB58,
    mint: p.mintAddress,
    network: p.network,
    rpcUrlOverride: p.rpcUrlOverride,
  });
  await signAndSendLegacyPaymentTransaction({
    network: p.network,
    rpcUrlOverride: p.rpcUrlOverride,
    signer: p.signer,
    unsigned: initUnsigned,
  });
}

export function resolveRpcUrl(
  network: NetworkId,
  rpcUrlOverride?: string | null,
): string {
  const trimmed = rpcUrlOverride?.trim();
  if (trimmed) return trimmed;
  return NETWORKS[network].rpc;
}

export function getConnection(
  network: NetworkId,
  rpcUrlOverride?: string | null,
): Connection {
  const url = resolveRpcUrl(network, rpcUrlOverride);
  return new Connection(url, { commitment: "confirmed" });
}

export async function fetchSolBalanceBaseUnits(
  network: NetworkId,
  address: string,
  rpcUrlOverride?: string | null,
): Promise<bigint> {
  const conn = getConnection(network, rpcUrlOverride);
  const raw = await conn.getBalance(new PublicKey(address));
  return BigInt(raw);
}

export async function requestAirdropDevnet(
  network: NetworkId,
  publicKey: string,
  sol = 1,
  rpcUrlOverride?: string | null,
): Promise<string> {
  if (network !== "devnet") {
    throw new Error("Airdrop is only available on Devnet");
  }
  const conn = getConnection(network, rpcUrlOverride);
  const sig = await conn.requestAirdrop(
    new PublicKey(publicKey),
    Math.floor(sol * Number(SOL_BASE_UNITS_PER_SOL)),
  );
  const latest = await conn.getLatestBlockhash();
  await conn.confirmTransaction(
    { signature: sig, ...latest },
    "confirmed",
  );
  return sig;
}

export async function sendSol(params: {
  network: NetworkId;
  from: Keypair;
  toAddress: string;
  solAmount: number;
  rpcUrlOverride?: string | null;
}): Promise<string> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const to = new PublicKey(params.toAddress);
  const transferBaseUnits = BigInt(
    Math.floor(params.solAmount * Number(SOL_BASE_UNITS_PER_SOL)),
  );
  if (transferBaseUnits <= 0n) throw new Error("Amount must be positive");

  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: params.from.publicKey,
    recentBlockhash: blockhash,
  }).add(
    SystemProgram.transfer({
      fromPubkey: params.from.publicKey,
      toPubkey: to,
      lamports: transferBaseUnits,
    }),
  );
  tx.sign(params.from);
  const raw = tx.serialize();
  return sendRawTransactionWithDetailedLogs(
    conn,
    raw,
    blockhash,
    lastValidBlockHeight,
    { skipPreflight: false, preflightCommitment: "confirmed" },
    {
      flow: "sendSol",
      network: params.network,
      from: params.from.publicKey.toBase58(),
      to: params.toAddress,
      lamports: transferBaseUnits.toString(),
    },
  );
}

// Private wSOL on PER when possible; devnet surfaces errors; mainnet falls back to native SOL transfer.
export async function sendSolPreferMagicBlockPrivate(params: {
  network: NetworkId;
  from: Keypair;
  toAddress: string;
  solAmount: number;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string; route: "private" | "standard" }> {
  const lamports = BigInt(
    Math.floor(params.solAmount * Number(SOL_BASE_UNITS_PER_SOL)),
  );
  if (lamports <= 0n) throw new Error("Amount must be positive");

  const fromB58 = params.from.publicKey.toBase58();
  const toTrim = params.toAddress.trim();
  if (!toTrim) throw new Error("Recipient required");

  try {
    await ensurePaymentsMintInitializedForSpl({
      mintAddress: SOL_WRAPPED_MINT,
      network: params.network,
      payerB58: fromB58,
      signer: params.from,
      rpcUrlOverride: params.rpcUrlOverride,
    });

    const transferUnsigned = await paymentsPostSplTransfer({
      from: fromB58,
      to: toTrim,
      mint: SOL_WRAPPED_MINT,
      amount: amountToApiNumber(lamports),
      visibility: "private",
      fromBalance: "ephemeral",
      toBalance: "ephemeral",
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride,
    });

    const sig = await signAndSendLegacyPaymentTransaction({
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride,
      signer: params.from,
      unsigned: transferUnsigned,
      defaultSendToWhenMissing: "ephemeral",
    });
    return { signature: sig, route: "private" };
  } catch (e) {
    console.error("[Brume] Private SOL (wSOL) path failed, falling back", e);
    if (params.network === "devnet") {
      throw e instanceof Error ? e : new Error(String(e));
    }
    const sig = await sendSol({
      network: params.network,
      from: params.from,
      toAddress: params.toAddress,
      solAmount: params.solAmount,
      rpcUrlOverride: params.rpcUrlOverride,
    });
    return { signature: sig, route: "standard" };
  }
}

export function humanAmountToTokenRaw(
  amountStr: string,
  decimals: number,
): bigint {
  const t = amountStr.trim().replace(/,/g, "");
  if (!t || t === ".") throw new Error("Invalid amount");
  if (t.startsWith("-")) throw new Error("Invalid amount");
  const m = t.match(/^(\d*)(?:\.(\d+))?$/);
  if (!m) throw new Error("Invalid amount");
  const wi = m[1] || "0";
  let fr = m[2] || "";
  if (fr.length > decimals) fr = fr.slice(0, decimals);
  fr = fr.padEnd(decimals, "0");
  const whole = BigInt(wi || "0");
  const frac = decimals > 0 ? BigInt(fr || "0") : 0n;
  const scale = 10n ** BigInt(decimals);
  const out = whole * scale + frac;
  if (out <= 0n) throw new Error("Amount must be positive");
  return out;
}

export async function readMintForTransfer(
  conn: Connection,
  mint: PublicKey,
): Promise<{ decimals: number; tokenProgram: TokenProgramKind }> {
  const info = await conn.getAccountInfo(mint, "confirmed");
  if (!info) throw new Error("Mint not found");
  if (
    !info.owner.equals(TOKEN_PROGRAM_ID) &&
    !info.owner.equals(TOKEN_2022_PROGRAM_ID)
  ) {
    throw new Error("Not an SPL token mint");
  }
  const tokenProgram: TokenProgramKind = info.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? "token-2022"
    : "token";
  const parsed = await conn.getParsedAccountInfo(mint);
  const data = parsed.value?.data;
  if (!data || !("parsed" in data) || data.parsed.type !== "mint") {
    throw new Error("Could not read mint");
  }
  const dec = (data.parsed.info as { decimals?: number }).decimals;
  if (typeof dec !== "number" || dec < 0 || dec > 18) {
    throw new Error("Invalid mint decimals");
  }
  return { decimals: dec, tokenProgram };
}

// Private SPL on PER when possible; devnet surfaces errors; mainnet falls back to on-chain SPL transfer.
export async function sendSplPreferMagicBlockPrivate(params: {
  network: NetworkId;
  from: Keypair;
  toAddress: string;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string; route: "private" | "standard" }> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mintPk = new PublicKey(params.mintAddress);
  const { decimals } = await readMintForTransfer(conn, mintPk);
  const amountRaw = humanAmountToTokenRaw(params.amountStr, decimals);
  const fromB58 = params.from.publicKey.toBase58();

  try {
    await ensurePaymentsMintInitializedForSpl({
      mintAddress: params.mintAddress,
      network: params.network,
      payerB58: fromB58,
      signer: params.from,
      rpcUrlOverride: params.rpcUrlOverride,
    });

    const transferUnsigned = await paymentsPostSplTransfer({
      from: fromB58,
      to: params.toAddress.trim(),
      mint: params.mintAddress,
      amount: amountToApiNumber(amountRaw),
      visibility: "private",
      fromBalance: "ephemeral",
      toBalance: "ephemeral",
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride,
    });

    const sig = await signAndSendLegacyPaymentTransaction({
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride,
      signer: params.from,
      unsigned: transferUnsigned,
      defaultSendToWhenMissing: "ephemeral",
    });
    return { signature: sig, route: "private" };
  } catch (e) {
    console.error("[Brume] Private SPL path failed, falling back", e);
    if (params.network === "devnet") {
      throw e instanceof Error ? e : new Error(String(e));
    }
    const sig = await sendSplToken({
      network: params.network,
      from: params.from,
      toAddress: params.toAddress,
      mintAddress: params.mintAddress,
      amountStr: params.amountStr,
      rpcUrlOverride: params.rpcUrlOverride,
    });
    return { signature: sig, route: "standard" };
  }
}

// Shielded (ephemeral) balance → recipient ephemeral; fails if private balance too low.
export async function sendSplPrivateEphemeral(params: {
  network: NetworkId;
  from: Keypair;
  toAddress: string;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string; route: "private" }> {
  const toTrim = params.toAddress.trim();
  if (!toTrim) throw new Error("Recipient required");
  const fromB58 = params.from.publicKey.toBase58();
  if (toTrim === fromB58) {
    throw new Error("Recipient must differ from your wallet");
  }

  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mintPk = new PublicKey(params.mintAddress);
  const { decimals } = await readMintForTransfer(conn, mintPk);
  const amountRaw = humanAmountToTokenRaw(params.amountStr, decimals);

  const privStr = await paymentsGetPrivateBalance(
    fromB58,
    params.mintAddress,
    params.network,
    params.rpcUrlOverride,
  );
  const priv = BigInt(privStr);
  if (priv < amountRaw) {
    throw new Error("Insufficient shielded balance");
  }

  await ensurePaymentsMintInitializedForSpl({
    mintAddress: params.mintAddress,
    network: params.network,
    payerB58: fromB58,
    signer: params.from,
    rpcUrlOverride: params.rpcUrlOverride,
  });

  const amountNum = amountToApiNumber(amountRaw);
  const transferUnsigned =
    (await fetchBrumePerTransferUnsigned({
      from: fromB58,
      to: toTrim,
      mint: params.mintAddress.trim(),
      amount: amountNum,
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride ?? null,
    })) ??
    (await paymentsPostSplTransfer({
      from: fromB58,
      to: toTrim,
      mint: params.mintAddress.trim(),
      amount: amountNum,
      visibility: "private",
      fromBalance: "ephemeral",
      toBalance: "ephemeral",
      network: params.network,
      rpcUrlOverride: params.rpcUrlOverride,
    }));

  const sig = await signAndSendLegacyPaymentTransaction({
    network: params.network,
    rpcUrlOverride: params.rpcUrlOverride,
    signer: params.from,
    unsigned: transferUnsigned,
    defaultSendToWhenMissing: "ephemeral",
  });
  return { signature: sig, route: "private" };
}

export async function sendSplToken(params: {
  network: NetworkId;
  from: Keypair;
  toAddress: string;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<string> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mint = new PublicKey(params.mintAddress);
  const recipient = new PublicKey(params.toAddress);
  const owner = params.from.publicKey;
  const { decimals, tokenProgram } = await readMintForTransfer(conn, mint);
  const amountRaw = humanAmountToTokenRaw(params.amountStr, decimals);
  const programId = tokenProgramPubkey(tokenProgram);

  const sourceAta = getAssociatedTokenAddressSync(mint, owner, programId);
  const destAta = getAssociatedTokenAddressSync(mint, recipient, programId);

  const bal = await conn.getTokenAccountBalance(sourceAta);
  const have = BigInt(bal.value.amount);
  if (have < amountRaw) throw new Error("Insufficient token balance");

  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  });

  const destAcc = await conn.getAccountInfo(destAta, "confirmed");
  if (!destAcc) {
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        owner,
        destAta,
        recipient,
        mint,
        programId,
      ),
    );
  }

  tx.add(
    createTransferCheckedInstruction(
      sourceAta,
      mint,
      destAta,
      owner,
      amountRaw,
      decimals,
      programId,
    ),
  );

  tx.sign(params.from);
  const raw = tx.serialize();
  return sendRawTransactionWithDetailedLogs(
    conn,
    raw,
    blockhash,
    lastValidBlockHeight,
    { skipPreflight: false, preflightCommitment: "confirmed" },
    {
      flow: "sendSplToken",
      network: params.network,
      mint: params.mintAddress,
      from: owner.toBase58(),
      to: params.toAddress,
      amountRaw: amountRaw.toString(),
    },
  );
}

export type BurnSplTokenResult = {
  signature: string;
  mintAddress: string;
  burnAll: boolean;
  // Remaining smallest units, or null when burn-all closed the ATA.
  remainingAmountRaw: string | null;
};

export async function burnSplToken(params: {
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<BurnSplTokenResult> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mint = new PublicKey(params.mintAddress);
  const owner = params.from.publicKey;
  const { decimals, tokenProgram } = await readMintForTransfer(conn, mint);
  const programId = tokenProgramPubkey(tokenProgram);
  const sourceAta = getAssociatedTokenAddressSync(mint, owner, programId);

  const bal = await conn.getTokenAccountBalance(sourceAta);
  const have = BigInt(bal.value.amount);
  if (have <= 0n) throw new Error("No tokens to burn");

  const rawMode = params.amountStr.trim().toLowerCase();
  const burnAll = rawMode === "all" || rawMode === "*";

  let amountRaw: bigint;
  if (burnAll) {
    amountRaw = have;
  } else {
    amountRaw = humanAmountToTokenRaw(params.amountStr, decimals);
    if (amountRaw <= 0n) throw new Error("Amount must be positive");
    if (amountRaw > have) throw new Error("Insufficient token balance");
  }

  const { blockhash, lastValidBlockHeight } =
    await conn.getLatestBlockhash();

  const tx = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  });

  tx.add(
    createBurnCheckedInstruction(
      sourceAta,
      mint,
      owner,
      amountRaw,
      decimals,
      programId,
    ),
  );

  if (burnAll) {
    tx.add(
      createCloseAccountInstruction(sourceAta, owner, owner, programId),
    );
  }

  tx.sign(params.from);
  const raw = tx.serialize();
  const sig = await sendRawTransactionWithDetailedLogs(
    conn,
    raw,
    blockhash,
    lastValidBlockHeight,
    { skipPreflight: false, preflightCommitment: "confirmed" },
    {
      flow: "burnSplToken",
      network: params.network,
      mint: params.mintAddress,
      owner: owner.toBase58(),
      burnAll,
      amountRaw: amountRaw.toString(),
    },
  );
  return {
    signature: sig,
    mintAddress: params.mintAddress,
    burnAll,
    remainingAmountRaw: burnAll ? null : (have - amountRaw).toString(),
  };
}

// Wrap native SOL into wSOL: creates the wSOL ATA if needed, transfers SOL in,
// then syncs the ATA balance. `amountSol` is a human decimal string (e.g. "1.5").
export async function wrapSol(params: {
  network: NetworkId;
  from: Keypair;
  amountSol: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const owner = params.from.publicKey;
  const mint = new PublicKey(SOL_WRAPPED_MINT);
  const wsolAta = getAssociatedTokenAddressSync(mint, owner, TOKEN_PROGRAM_ID);

  const lamports = BigInt(Math.round(parseFloat(params.amountSol) * 1e9));
  if (lamports <= 0n) throw new Error("Amount must be positive");

  const nativeBal = await conn.getBalance(owner);
  if (BigInt(nativeBal) < lamports + 5000n) throw new Error("Insufficient SOL (need amount + fees)");

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });

  tx.add(createAssociatedTokenAccountIdempotentInstruction(owner, wsolAta, owner, mint, TOKEN_PROGRAM_ID));
  tx.add(SystemProgram.transfer({ fromPubkey: owner, toPubkey: wsolAta, lamports }));
  tx.add(createSyncNativeInstruction(wsolAta));
  tx.sign(params.from);

  const sig = await sendRawTransactionWithDetailedLogs(
    conn,
    tx.serialize(),
    blockhash,
    lastValidBlockHeight,
    { skipPreflight: false, preflightCommitment: "confirmed" },
    { flow: "wrapSol", network: params.network, owner: owner.toBase58(), lamports: lamports.toString() },
  );
  return { signature: sig };
}

// Unwrap wSOL by closing the wSOL ATA. The Solana runtime converts the token
// balance + rent back to native SOL automatically on close.
export async function unwrapSol(params: {
  network: NetworkId;
  from: Keypair;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const owner = params.from.publicKey;
  const mint = new PublicKey(SOL_WRAPPED_MINT);
  const wsolAta = getAssociatedTokenAddressSync(mint, owner, TOKEN_PROGRAM_ID);

  const bal = await conn.getTokenAccountBalance(wsolAta);
  const have = BigInt(bal.value.amount);
  if (have <= 0n) throw new Error("No wSOL to unwrap");

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
  tx.add(createCloseAccountInstruction(wsolAta, owner, owner, TOKEN_PROGRAM_ID));
  tx.sign(params.from);

  const sig = await sendRawTransactionWithDetailedLogs(
    conn,
    tx.serialize(),
    blockhash,
    lastValidBlockHeight,
    { skipPreflight: false, preflightCommitment: "confirmed" },
    { flow: "unwrapSol", network: params.network, owner: owner.toBase58() },
  );
  return { signature: sig };
}

// Smallest-unit SPL balance for `owner` ATA at `mint`, read at the given commitment (default processed).

export async function fetchSplAtaBalanceRawForOwner(
  params: {
    network: NetworkId;
    ownerB58: string;
    mintAddress: string;
    rpcUrlOverride?: string | null;
  },
  commitment: "processed" | "confirmed" = "processed",
): Promise<string> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const owner = new PublicKey(params.ownerB58.trim());
  const mint = new PublicKey(params.mintAddress.trim());
  const { tokenProgram } = await readMintForTransfer(conn, mint);
  const programId = tokenProgramPubkey(tokenProgram);
  const ata = getAssociatedTokenAddressSync(mint, owner, programId);
  const acc = await conn.getAccountInfo(ata, commitment);
  if (!acc) return "0";
  const bal = await conn.getTokenAccountBalance(ata, commitment);
  return bal.value.amount;
}

// Base-layer ATA balance + PER private balance from Payments API (queries, not on-chain reads for private leg).
export async function fetchShieldBalanceInfo(params: {
  network: NetworkId;
  rpcUrlOverride?: string | null;
  ownerAddress: string;
  mintAddress: string;
}): Promise<{
  decimals: number;
  baseBalanceRaw: string;
  privateBalanceRaw: string;
}> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mintPk = new PublicKey(params.mintAddress);
  const { decimals } = await readMintForTransfer(conn, mintPk);
  const owner = params.ownerAddress.trim();

  const [baseBalanceRaw, privateBalanceRaw] = await Promise.all([
    params.network === "devnet"
      ? fetchSplAtaBalanceRawForOwner(
          {
            network: params.network,
            ownerB58: owner,
            mintAddress: params.mintAddress,
            rpcUrlOverride: params.rpcUrlOverride,
          },
          "processed",
        ).catch(() => "0")
      : paymentsGetSplBalance(
          owner,
          params.mintAddress,
          params.network,
          params.rpcUrlOverride,
        ).catch(() => "0"),
    paymentsGetPrivateBalance(
      owner,
      params.mintAddress,
      params.network,
      params.rpcUrlOverride,
    ).catch(() => "0"),
  ]);

  return {
    decimals,
    baseBalanceRaw,
    privateBalanceRaw,
  };
}

export async function shieldSplToken(params: {
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mintPk = new PublicKey(params.mintAddress);
  const { decimals } = await readMintForTransfer(conn, mintPk);
  const amountRaw = humanAmountToTokenRaw(params.amountStr, decimals);
  if (amountRaw < 1n) {
    throw new Error("Amount must be at least one smallest unit");
  }

  const payerB58 = params.from.publicKey.toBase58();
  await ensurePaymentsMintInitializedForSpl({
    mintAddress: params.mintAddress,
    network: params.network,
    payerB58,
    signer: params.from,
    rpcUrlOverride: params.rpcUrlOverride,
  });

  const depositUnsigned = await paymentsPostSplDeposit({
    owner: payerB58,
    mint: params.mintAddress,
    amount: amountToApiNumber(amountRaw),
    network: params.network,
    rpcUrlOverride: params.rpcUrlOverride,
  });

  const sig = await signAndSendLegacyPaymentTransaction({
    network: params.network,
    rpcUrlOverride: params.rpcUrlOverride,
    signer: params.from,
    unsigned: depositUnsigned,
  });
  return { signature: sig };
}

export async function unshieldSplToken(params: {
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const mintPk = new PublicKey(params.mintAddress);
  const { decimals } = await readMintForTransfer(conn, mintPk);
  const amountRaw = humanAmountToTokenRaw(params.amountStr, decimals);
  if (amountRaw < 1n) {
    throw new Error("Amount must be at least one smallest unit");
  }

  const owner = params.from.publicKey.toBase58();
  const withdrawUnsigned = await paymentsPostSplWithdraw({
    owner,
    mint: params.mintAddress,
    amount: amountToApiNumber(amountRaw),
    network: params.network,
    rpcUrlOverride: params.rpcUrlOverride,
  });

  const sig = await signAndSendLegacyPaymentTransaction({
    network: params.network,
    rpcUrlOverride: params.rpcUrlOverride,
    signer: params.from,
    unsigned: withdrawUnsigned,
  });
  return { signature: sig };
}

export function deserializeTransaction(
  bytes: Uint8Array,
): Transaction | VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

export async function signTransactionBytes(
  bytes: Uint8Array,
  signer: Keypair,
): Promise<Uint8Array> {
  const tx = deserializeTransaction(bytes);
  if (tx instanceof VersionedTransaction) {
    tx.sign([signer]);
    return tx.serialize();
  }
  tx.partialSign(signer);
  return tx.serialize();
}

export async function signAllTransactionBytes(
  list: Uint8Array[],
  signer: Keypair,
): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const b of list) {
    out.push(await signTransactionBytes(b, signer));
  }
  return out;
}

// Detached Ed25519 over raw bytes (dApp signMessage).
export function signMessageBytes(message: Uint8Array, signer: Keypair): Uint8Array {
  return nacl.sign.detached(message, signer.secretKey);
}

export async function getRecentSignatures(
  network: NetworkId,
  address: string,
  limit = 15,
  rpcUrlOverride?: string | null,
): Promise<
  Array<{
    signature: string;
    slot: number | null;
    err: unknown;
    blockTime: number | null;
  }>
> {
  const conn = getConnection(network, rpcUrlOverride);
  const rows = await conn.getSignaturesForAddress(new PublicKey(address), {
    limit,
  });
  return rows.map((s) => ({
    signature: s.signature,
    slot: s.slot ?? null,
    err: s.err,
    blockTime: s.blockTime ?? null,
  }));
}

const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
);

// Burns an MPL Core NFT asset using the BurnV1 instruction (discriminator=12).
export async function burnMplCoreNft(params: {
  network: NetworkId;
  from: Keypair;
  assetAddress: string;
  collectionAddress: string | null;
  rpcUrlOverride?: string | null;
}): Promise<string> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const asset = new PublicKey(params.assetAddress);
  const owner = params.from.publicKey;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();

  // BurnV1 data: u8 discriminator (12) + option<CompressionProof> = None (0x00)
  const data = Buffer.from([12, 0]);

  const keys: AccountMeta[] = [
    { pubkey: asset, isSigner: false, isWritable: true },
    {
      pubkey: params.collectionAddress
        ? new PublicKey(params.collectionAddress)
        : MPL_CORE_PROGRAM_ID,
      isSigner: false,
      isWritable: !!params.collectionAddress,
    },
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
  tx.add(new TransactionInstruction({ keys, programId: MPL_CORE_PROGRAM_ID, data }));
  tx.sign(params.from);

  return sendRawTransactionWithDetailedLogs(
    conn,
    tx.serialize(),
    blockhash,
    lastValidBlockHeight,
    { skipPreflight: false, preflightCommitment: "confirmed" },
    { flow: "burnMplCoreNft", network: params.network, asset: params.assetAddress },
  );
}
