// Wallet transaction sender: version 1 first, version 0 with lookup tables when an RPC cannot take v1.
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type AddressLookupTableAccount,
  type Connection,
  type Keypair,
  type MessageV0,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { NetworkId } from "@/shared/constants";
import { detailedTransactionFailureMessage, serializeUnknownForLog } from "@/shared/errors";
import { MAX_COMPUTE_UNITS, type PriorityLevel } from "@/shared/priority-fee";
import { computeBudgetInstructions, priorityFeesApply } from "./priority-fee";
import { isV1Unsupported, sendV1 } from "./tx-v1";

const PACKET_LIMIT = 1232;
const LOOKUP_STORAGE_KEY = "brume_lookup_v1";
const LOOKUP_EXTEND_CHUNK = 20;
const LOOKUP_MAX_ADDRESSES = 256;

type BudgetMode = "full" | "price" | "none";

export type PreparedOperationLike = {
  readonly operation: string;
  readonly instructions: readonly TransactionInstruction[];
  readonly lookupTableAccounts: readonly AddressLookupTableAccount[];
};

// Serialized size of a one-message transaction, or null when it cannot fit in a packet at all.
function txSize(message: MessageV0): number | null {
  try {
    return 1 + 64 * message.header.numRequiredSignatures + message.serialize().length;
  } catch {
    return null;
  }
}

function fits(message: MessageV0): boolean {
  const n = txSize(message);
  return n != null && n <= PACKET_LIMIT;
}

function compile(payer: PublicKey, ixs: readonly TransactionInstruction[], tables: readonly AddressLookupTableAccount[]): MessageV0 {
  return new TransactionMessage({ payerKey: payer, recentBlockhash: PublicKey.default.toBase58(), instructions: [...ixs] }).compileToV0Message([...tables]);
}

// Accounts a lookup table may carry: never signers and never invoked program ids.
function lookupCandidates(ixs: readonly TransactionInstruction[], tables: readonly AddressLookupTableAccount[]): PublicKey[] {
  const programs = new Set(ixs.map((ix) => ix.programId.toBase58()));
  const signers = new Set(ixs.flatMap((ix) => ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())));
  const covered = new Set(tables.flatMap((t) => t.state.addresses.map((a) => a.toBase58())));
  const out = new Map<string, PublicKey>();
  for (const ix of ixs) {
    for (const k of ix.keys) {
      const id = k.pubkey.toBase58();
      if (!programs.has(id) && !signers.has(id) && !covered.has(id)) out.set(id, k.pubkey);
    }
  }
  return [...out.values()];
}

async function readLookupMap(): Promise<Record<string, string>> {
  const raw = await chrome.storage.local.get(LOOKUP_STORAGE_KEY);
  const v = raw[LOOKUP_STORAGE_KEY];
  return v && typeof v === "object" ? (v as Record<string, string>) : {};
}

async function waitForTable(conn: Connection, address: PublicKey, wanted: PublicKey[], afterSlot: number): Promise<AddressLookupTableAccount> {
  for (let i = 0; i < 60; i++) {
    const [table, slot] = await Promise.all([conn.getAddressLookupTable(address, { commitment: "confirmed" }), conn.getSlot("confirmed")]);
    const have = new Set(table.value?.state.addresses.map((a) => a.toBase58()) ?? []);
    if (table.value && slot > afterSlot && wanted.every((w) => have.has(w.toBase58()))) return table.value;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Lookup table did not activate in time");
}

// The payer's Brume lookup table, created or extended so it holds `wanted`; addresses are usable one slot later.
async function brumeLookupTable(params: {
  conn: Connection;
  network: NetworkId;
  payer: Keypair;
  wanted: PublicKey[];
  priority?: PriorityLevel;
}): Promise<AddressLookupTableAccount> {
  const { conn, network, payer } = params;
  const key = `${network}:${payer.publicKey.toBase58()}`;
  const stored = (await readLookupMap())[key];
  let address = stored ? new PublicKey(stored) : null;
  const current = address ? (await conn.getAddressLookupTable(address, { commitment: "confirmed" })).value : null;
  if (address && !current) address = null;
  const have = new Set(current?.state.addresses.map((a) => a.toBase58()) ?? []);
  const missing = params.wanted.filter((w) => !have.has(w.toBase58()));
  if (address && missing.length === 0) return current!;
  if ((current?.state.addresses.length ?? 0) + missing.length > LOOKUP_MAX_ADDRESSES) {
    throw new Error("Brume lookup table is full");
  }

  let lastSlot = await conn.getSlot("confirmed");
  if (!address) {
    const [create, created] = AddressLookupTableProgram.createLookupTable({
      authority: payer.publicKey,
      payer: payer.publicKey,
      recentSlot: await conn.getSlot("finalized"),
    });
    await sendV0({ conn, network, signers: [payer], ixs: [create], priority: params.priority, label: "create lookup table", fitWithLookup: false });
    address = created;
    const map = await readLookupMap();
    map[key] = created.toBase58();
    await chrome.storage.local.set({ [LOOKUP_STORAGE_KEY]: map });
  }
  for (let i = 0; i < missing.length; i += LOOKUP_EXTEND_CHUNK) {
    const extend = AddressLookupTableProgram.extendLookupTable({
      lookupTable: address,
      authority: payer.publicKey,
      payer: payer.publicKey,
      addresses: missing.slice(i, i + LOOKUP_EXTEND_CHUNK),
    });
    await sendV0({ conn, network, signers: [payer], ixs: [extend], priority: params.priority, label: "extend lookup table", fitWithLookup: false });
    lastSlot = await conn.getSlot("confirmed");
  }
  return waitForTable(conn, address, params.wanted, lastSlot);
}

// Fee payer is signers[0]; every other required signer must be in `signers`. Oversized transactions get a Brume lookup table.
export async function sendV0(params: {
  conn: Connection;
  network: NetworkId;
  signers: readonly Keypair[];
  ixs: readonly TransactionInstruction[];
  lookupTables?: readonly AddressLookupTableAccount[];
  priority?: PriorityLevel;
  label: string;
  fitWithLookup?: boolean;
}): Promise<string> {
  const { conn, network, signers, label } = params;
  const payer = signers[0];
  if (!payer) throw new Error("A fee payer is required");
  const tables = [...(params.lookupTables ?? [])];

  // Fit ladder: lookup table first, then price-only budget, then no budget; size checks use placeholder budget instructions.
  const placeholders = (mode: BudgetMode) =>
    mode === "full"
      ? [ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })]
      : mode === "price"
        ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })]
        : [];
  const fitsWith = (mode: BudgetMode) => fits(compile(payer.publicKey, [...placeholders(mode), ...params.ixs], tables));
  let mode: BudgetMode = priorityFeesApply(network) ? "full" : "none";
  if (!fitsWith(mode) && params.fitWithLookup !== false && lookupCandidates(params.ixs, tables).length > 0) {
    tables.push(await brumeLookupTable({ conn, network, payer, wanted: lookupCandidates(params.ixs, tables), priority: params.priority }));
  }
  while (!fitsWith(mode) && mode !== "none") mode = mode === "full" ? "price" : "none";
  if (!fitsWith(mode)) throw new Error(`${label} is too large for one transaction`);

  const fullBudget =
    mode === "none"
      ? []
      : await computeBudgetInstructions({ conn, network, payer: payer.publicKey, ixs: params.ixs, lookupTables: tables, level: params.priority });
  // Price-only keeps setComputeUnitPrice (the last budget instruction) with the default compute limit.
  const budget = mode === "price" ? fullBudget.slice(-1) : fullBudget;
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [...budget, ...params.ixs],
  }).compileToV0Message(tables);
  const tx = new VersionedTransaction(message);
  tx.sign([...signers]);

  try {
    const signature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const res = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
    return signature;
  } catch (e) {
    const message = await detailedTransactionFailureMessage(e, conn);
    console.error(
      `[Brume] ${label} failed\n${JSON.stringify({ network, error: serializeUnknownForLog(e), message }, null, 2)}`,
    );
    throw new Error(message);
  }
}

// RPC endpoints that rejected a v1 transaction; they get v0 for the rest of the session.
const v0OnlyEndpoints = new Set<string>();

// Sends as version 1; falls back to version 0 (with a Brume lookup table when needed) if the RPC cannot take v1.
export async function sendVersioned(params: {
  conn: Connection;
  network: NetworkId;
  signers: readonly Keypair[];
  ixs: readonly TransactionInstruction[];
  lookupTables?: readonly AddressLookupTableAccount[];
  priority?: PriorityLevel;
  label: string;
}): Promise<string> {
  const { conn, network, label } = params;
  if (!v0OnlyEndpoints.has(conn.rpcEndpoint)) {
    try {
      return await sendV1(params);
    } catch (e) {
      if (!isV1Unsupported(e)) {
        const message = await detailedTransactionFailureMessage(e, conn);
        console.error(`[Brume] ${label} failed (v1)\n${JSON.stringify({ network, error: serializeUnknownForLog(e), message }, null, 2)}`);
        throw new Error(message);
      }
      v0OnlyEndpoints.add(conn.rpcEndpoint);
      console.warn(`[Brume] ${conn.rpcEndpoint} does not accept v1 transactions; using v0`);
    }
  }
  return sendV0(params);
}

// Sends prepared SDK operations one after another, in the given order.
export async function sendPreparedInOrder(params: {
  conn: Connection;
  network: NetworkId;
  signers: readonly Keypair[];
  operations: readonly (PreparedOperationLike | null | undefined)[];
  priority?: PriorityLevel;
}): Promise<string[]> {
  const signatures: string[] = [];
  for (const op of params.operations) {
    if (!op || op.instructions.length === 0) continue;
    signatures.push(
      await sendVersioned({
        conn: params.conn,
        network: params.network,
        signers: params.signers,
        ixs: op.instructions,
        lookupTables: op.lookupTableAccounts,
        priority: params.priority,
        label: op.operation,
      }),
    );
  }
  return signatures;
}
