// Version 1 transactions: budget in the message (no ComputeBudget instructions), 4,096-byte limit, no lookup tables.
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getTransactionEncoder,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type Instruction,
  type SignatureBytes,
  type V1TransactionConfig,
} from "@solana/kit";
import { ComputeBudgetProgram, type Connection, type Keypair, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { encodeBase58 } from "@/shared/base58";
import type { NetworkId } from "@/shared/constants";
import {
  MAX_COMPUTE_UNITS,
  MAX_LOADED_ACCOUNTS_DATA_SIZE,
  computeUnitLimitFor,
  loadedDataLimitFor,
  normalizePriorityLevel,
  priorityFeeLamports,
  type PriorityLevel,
} from "@/shared/priority-fee";
import { estimatePriorityPrice, priorityFeesApply } from "./priority-fee";

// Maximum serialized size of a version 1 transaction (same value as kit's internal limit).
export const V1_SIZE_LIMIT = 4096;

// v1 carries its budget in the message, so any ComputeBudget instruction is dropped.
export function withoutComputeBudget(ixs: readonly TransactionInstruction[]): TransactionInstruction[] {
  return ixs.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId));
}

function role(isSigner: boolean, isWritable: boolean): AccountRole {
  if (isSigner) return isWritable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER;
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

function toKitInstruction(ix: TransactionInstruction): Instruction {
  return {
    programAddress: address(ix.programId.toBase58()),
    accounts: ix.keys.map((k) => ({ address: address(k.pubkey.toBase58()), role: role(k.isSigner, k.isWritable) })),
    data: Uint8Array.from(ix.data),
  };
}

// Compiles, signs (ed25519 over the message bytes) and encodes a v1 transaction; throws if it exceeds 4,096 bytes.
export function buildV1Transaction(params: {
  payer: PublicKey;
  signers: readonly Keypair[];
  ixs: readonly TransactionInstruction[];
  blockhash: string;
  lastValidBlockHeight: number;
  config: V1TransactionConfig;
}): { bytes: Uint8Array; signature: string } {
  const message = pipe(
    createTransactionMessage({ version: 1 }),
    (m) => setTransactionMessageFeePayer(address(params.payer.toBase58()), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: params.blockhash as Blockhash, lastValidBlockHeight: BigInt(params.lastValidBlockHeight) },
        m,
      ),
    (m) => appendTransactionMessageInstructions(withoutComputeBudget(params.ixs).map(toKitInstruction), m),
    (m) => setTransactionMessageConfig(params.config, m),
  );
  const compiled = compileTransaction(message);
  const signatures: Record<string, SignatureBytes | null> = { ...compiled.signatures };
  for (const signer of params.signers) {
    const key = signer.publicKey.toBase58();
    if (!(key in signatures)) continue;
    signatures[key] = nacl.sign.detached(Uint8Array.from(compiled.messageBytes), signer.secretKey) as SignatureBytes;
  }
  const missing = Object.entries(signatures).filter(([, sig]) => sig == null).map(([k]) => k);
  if (missing.length > 0) throw new Error(`Missing signer for ${missing.join(", ")}`);
  const bytes = Uint8Array.from(getTransactionEncoder().encode({ ...compiled, signatures } as typeof compiled));
  if (bytes.length > V1_SIZE_LIMIT) throw new Error(`Transaction is ${bytes.length} bytes, over the ${V1_SIZE_LIMIT}-byte limit`);
  return { bytes, signature: encodeBase58(signatures[params.payer.toBase58()]!) };
}

async function rpc<T>(conn: Connection, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(conn.rpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message ?? `${method} failed`);
  return body.result as T;
}

type SimValue = { err: unknown; unitsConsumed?: number; loadedAccountsDataSize?: number };

// Measures compute units and loaded account data with maximum limits; nulls when the simulation fails.
async function measure(conn: Connection, params: { payer: PublicKey; signers: readonly Keypair[]; ixs: readonly TransactionInstruction[] }) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const { bytes } = buildV1Transaction({
    ...params,
    blockhash,
    lastValidBlockHeight,
    config: { computeUnitLimit: MAX_COMPUTE_UNITS, loadedAccountsDataSizeLimit: MAX_LOADED_ACCOUNTS_DATA_SIZE },
  });
  const sim = await rpc<{ value: SimValue }>(conn, "simulateTransaction", [
    Buffer.from(bytes).toString("base64"),
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" },
  ]);
  if (sim.value.err) return { units: null, loaded: null };
  return { units: sim.value.unitsConsumed ?? null, loaded: sim.value.loadedAccountsDataSize ?? null };
}

// Builds, signs, sends and confirms a v1 transaction with measured limits and a total priority fee on mainnet.
export async function sendV1(params: {
  conn: Connection;
  network: NetworkId;
  signers: readonly Keypair[];
  ixs: readonly TransactionInstruction[];
  priority?: PriorityLevel;
}): Promise<string> {
  const { conn, network, signers } = params;
  const payer = signers[0].publicKey;
  const ixs = withoutComputeBudget(params.ixs);
  const { units, loaded } = await measure(conn, { payer, signers, ixs });
  const computeUnitLimit = computeUnitLimitFor(units, ixs.length);
  const config: V1TransactionConfig = {
    computeUnitLimit,
    loadedAccountsDataSizeLimit: loadedDataLimitFor(loaded),
  };
  if (priorityFeesApply(network)) {
    const price = await estimatePriorityPrice(conn, normalizePriorityLevel(params.priority), ixs);
    config.priorityFeeLamports = BigInt(priorityFeeLamports(price, computeUnitLimit));
  }
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const { bytes, signature } = buildV1Transaction({ payer, signers, ixs, blockhash, lastValidBlockHeight, config });
  await conn.sendRawTransaction(bytes, { skipPreflight: false, preflightCommitment: "confirmed" });
  const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}

// True when an RPC or validator cannot accept version 1 transactions, so the caller should fall back to v0.
export function isV1Unsupported(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /failed to deserialize|unsupported transaction version|invalid transaction version|Transaction version \(1\) is not supported/i.test(m);
}
