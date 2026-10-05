import { Buffer } from "buffer";
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
  type NetworkId,
} from "@/shared/constants";
import {
  detailedTransactionFailureMessage,
  serializeUnknownForLog,
} from "@/shared/errors";
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
import {
  fetchLoyalVaultBalance,
  fetchLoyalVaultBalances,
  loyalShield,
  loyalVaultTransferOut,
} from "./loyal-vault";

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

// Shielded balance = funds in the wallet's Loyal Smart Account vault (see loyal-vault.ts).

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
  const owner = params.ownerAddress.trim();
  const isSol = params.mintAddress === SOL_WRAPPED_MINT;
  const decimals = isSol
    ? 9
    : (await readMintForTransfer(conn, new PublicKey(params.mintAddress))).decimals;

  const [baseBalanceRaw, privateBalanceRaw] = await Promise.all([
    isSol
      ? fetchSolBalanceBaseUnits(params.network, owner, params.rpcUrlOverride)
          .then((n) => n.toString())
          .catch(() => "0")
      : fetchSplAtaBalanceRawForOwner(
          {
            network: params.network,
            ownerB58: owner,
            mintAddress: params.mintAddress,
            rpcUrlOverride: params.rpcUrlOverride,
          },
          "confirmed",
        ).catch(() => "0"),
    fetchLoyalVaultBalance({
      conn,
      network: params.network,
      owner: new PublicKey(owner),
      mintAddress: params.mintAddress,
    }).catch(() => "0"),
  ]);

  return { decimals, baseBalanceRaw, privateBalanceRaw };
}

export async function fetchShieldBalancesForOwner(params: {
  network: NetworkId;
  rpcUrlOverride?: string | null;
  ownerAddress: string;
}): Promise<Record<string, string>> {
  return fetchLoyalVaultBalances({
    conn: getConnection(params.network, params.rpcUrlOverride),
    network: params.network,
    owner: new PublicKey(params.ownerAddress.trim()),
  });
}

export async function shieldSplToken(params: {
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  const { signature } = await loyalShield({
    conn: getConnection(params.network, params.rpcUrlOverride),
    network: params.network,
    from: params.from,
    mintAddress: params.mintAddress,
    amountStr: params.amountStr,
  });
  return { signature };
}

export async function unshieldSplToken(params: {
  network: NetworkId;
  from: Keypair;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  const { signature } = await loyalVaultTransferOut({
    conn: getConnection(params.network, params.rpcUrlOverride),
    network: params.network,
    from: params.from,
    mintAddress: params.mintAddress,
    amountStr: params.amountStr,
  });
  return { signature };
}

export async function sendFromShieldedBalance(params: {
  network: NetworkId;
  from: Keypair;
  toAddress: string;
  mintAddress: string;
  amountStr: string;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string; route: "private" }> {
  const toTrim = params.toAddress.trim();
  if (!toTrim) throw new Error("Recipient required");
  const { signature } = await loyalVaultTransferOut({
    conn: getConnection(params.network, params.rpcUrlOverride),
    network: params.network,
    from: params.from,
    mintAddress: params.mintAddress,
    amountStr: params.amountStr,
    toAddress: toTrim,
  });
  return { signature, route: "private" };
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
