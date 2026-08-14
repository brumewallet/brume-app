
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  derivePool,
  deriveVault,
  emptyLeaf,
  hashPair,
  initializePoolIx,
  LocalTeeSigner,
  noteCommitment,
  POOL_PROGRAM_ID,
  TREE_DEPTH,
  type Note,
  type SpendWitness,
} from "@brume/sdk";
import { parseNoteAccount } from "@brume/sdk";
import type { NetworkId } from "@/shared/constants";

// Dev TEE secret seed (first 32 bytes of keys/brume_dev_tee-keypair.json).
// TODO: rotate for mainnet - replace with HttpTeeClient over the MagicBlock TDX enclave.
const DEV_TEE_SEED = new Uint8Array([
  58, 108, 165, 180, 24, 177, 152, 23, 133, 223, 47, 44, 4, 170, 207, 85,
  59, 103, 53, 173, 14, 93, 85, 118, 187, 203, 244, 110, 11, 174, 175, 47,
]);

export function getDevTeeSigner(): LocalTeeSigner {
  return new LocalTeeSigner(DEV_TEE_SEED);
}

export async function isBrumePoolInitialized(
  connection: Connection,
  mint: PublicKey,
): Promise<boolean> {
  const [pool] = derivePool(mint);
  const info = await connection.getAccountInfo(pool, "confirmed");
  return info?.owner.equals(POOL_PROGRAM_ID) ?? false;
}

export function buildInitializePoolTransaction(
  payer: PublicKey,
  mint: PublicKey,
): Transaction {
  const [pool, poolBump] = derivePool(mint);
  const [vault, vaultBump] = deriveVault(mint);
  return new Transaction().add(
    initializePoolIx({
      payer,
      pool,
      poolBump,
      mint,
      vault,
      vaultBump,
    }),
  );
}

export interface StoredNote {
  commitment: string;
  amount: string;
  mint: string;
  nullifierKey: string;
  blinding: string;
  leafIndex: number;
  spent: boolean;
}

function storageKey(network: NetworkId, ownerAddress: string): string {
  return `brume_notes_${network}_${ownerAddress}`;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadStoredNotes(
  network: NetworkId,
  ownerAddress: string,
): Promise<StoredNote[]> {
  const key = storageKey(network, ownerAddress);
  const raw = await chrome.storage.local.get(key);
  const stored = raw[key];
  if (!Array.isArray(stored)) return [];
  return stored as StoredNote[];
}

export async function saveStoredNote(
  network: NetworkId,
  ownerAddress: string,
  note: Note,
  commitment: Uint8Array,
  leafIndex: number,
): Promise<void> {
  const notes = await loadStoredNotes(network, ownerAddress);
  const commitmentHex = bytesToHex(commitment);
  if (notes.some((n) => n.commitment === commitmentHex)) return;
  const entry: StoredNote = {
    commitment: commitmentHex,
    amount: note.amount.toString(),
    mint: bytesToHex(note.mint),
    nullifierKey: bytesToHex(note.nullifierKey),
    blinding: bytesToHex(note.blinding),
    leafIndex,
    spent: false,
  };
  notes.push(entry);
  await chrome.storage.local.set({ [storageKey(network, ownerAddress)]: notes });
}

export async function markNoteSpent(
  network: NetworkId,
  ownerAddress: string,
  commitment: Uint8Array,
): Promise<void> {
  const notes = await loadStoredNotes(network, ownerAddress);
  const hexCmt = bytesToHex(commitment);
  const updated = notes.map((n) =>
    n.commitment === hexCmt ? { ...n, spent: true } : n,
  );
  await chrome.storage.local.set({ [storageKey(network, ownerAddress)]: updated });
}

export function storedNoteToSdk(sn: StoredNote): Note {
  return {
    amount: BigInt(sn.amount),
    mint: hexToBytes(sn.mint),
    nullifierKey: hexToBytes(sn.nullifierKey),
    blinding: hexToBytes(sn.blinding),
  };
}

export async function privateBalanceForMint(
  network: NetworkId,
  ownerAddress: string,
  mintBase58: string,
): Promise<bigint> {
  const notes = await loadStoredNotes(network, ownerAddress);
  const mintHex = bytesToHex(new PublicKey(mintBase58).toBytes());
  return notes
    .filter((n) => !n.spent && n.mint === mintHex)
    .reduce((acc, n) => acc + BigInt(n.amount), 0n);
}

const OFF_NEXT_INDEX = 74;
const OFF_ROOTS_CURSOR = 82;
const OFF_FILLED_SUBTREES = 90;
const OFF_ROOTS = 730;
const ROOT_HISTORY_SIZE = 32;

export interface PoolState {
  nextIndex: bigint;
  rootsCursor: bigint;
  filledSubtrees: Uint8Array[];
  roots: Uint8Array[];
}

export function parsePoolAccount(data: Uint8Array): PoolState {
  const view = new DataView(data.buffer, data.byteOffset);
  const nextIndex = view.getBigUint64(OFF_NEXT_INDEX, true);
  const rootsCursor = view.getBigUint64(OFF_ROOTS_CURSOR, true);

  const filledSubtrees: Uint8Array[] = [];
  for (let i = 0; i < TREE_DEPTH; i++) {
    const off = OFF_FILLED_SUBTREES + i * 32;
    filledSubtrees.push(data.slice(off, off + 32));
  }

  const roots: Uint8Array[] = [];
  for (let i = 0; i < ROOT_HISTORY_SIZE; i++) {
    const off = OFF_ROOTS + i * 32;
    roots.push(data.slice(off, off + 32));
  }

  return { nextIndex, rootsCursor, filledSubtrees, roots };
}

export function currentRoot(state: PoolState): Uint8Array {
  const cursor = Number(state.rootsCursor) % ROOT_HISTORY_SIZE;
  return state.roots[cursor]!;
}

function precomputeEmptyZeros(depth: number): Uint8Array[] {
  const zeros: Uint8Array[] = [emptyLeaf()];
  for (let l = 1; l <= depth; l++) {
    zeros.push(hashPair(zeros[l - 1]!, zeros[l - 1]!));
  }
  return zeros;
}

// indices 0..leaves.length-1; anything beyond that is empty.
function subtreeHash(
  nodeIdx: number,
  level: number,
  leaves: Uint8Array[],
  emptyZeros: Uint8Array[],
): Uint8Array {
  const startLeaf = nodeIdx * (1 << level);
  if (startLeaf >= leaves.length) {
    return emptyZeros[level]!;
  }
  if (level === 0) {
    return leaves[nodeIdx] ?? emptyZeros[0]!;
  }
  const left = subtreeHash(nodeIdx * 2, level - 1, leaves, emptyZeros);
  const right = subtreeHash(nodeIdx * 2 + 1, level - 1, leaves, emptyZeros);
  return hashPair(left, right);
}

export function buildMerklePath(
  targetIdx: number,
  leaves: Uint8Array[],
): Uint8Array[] {
  const emptyZeros = precomputeEmptyZeros(TREE_DEPTH);
  const path: Uint8Array[] = [];
  for (let level = 0; level < TREE_DEPTH; level++) {
    const nodeIdxAtLevel = targetIdx >> level;
    const siblingIdx = nodeIdxAtLevel ^ 1;
    path.push(subtreeHash(siblingIdx, level, leaves, emptyZeros));
  }
  return path;
}

export async function fetchPoolMerkleWitness(
  connection: Connection,
  poolPubkey: PublicKey,
  targetNote: Note,
): Promise<SpendWitness> {
  const commitment = noteCommitment(targetNote);

  const programAccounts = await connection.getProgramAccounts(POOL_PROGRAM_ID, {
    filters: [{ dataSize: 1240 }],
  });

  const announcements: Array<{ commitment: Uint8Array; createdAt: bigint }> = [];
  for (const { pubkey, account } of programAccounts) {
    const parsed = parseNoteAccount(pubkey, new Uint8Array(account.data));
    if (!parsed) continue;
    if (!parsed.pool.equals(poolPubkey)) continue;
    announcements.push({ commitment: parsed.commitment, createdAt: parsed.createdAt });
  }

  announcements.sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return 0;
  });

  const targetHex = bytesToHex(commitment);
  const leafIndex = announcements.findIndex(
    (a) => bytesToHex(a.commitment) === targetHex,
  );
  if (leafIndex === -1) {
    throw new Error("Target commitment not found in pool note accounts");
  }

  const leaves = announcements.map((a) => a.commitment);

  const poolAccount = await connection.getAccountInfo(poolPubkey, "confirmed");
  if (!poolAccount) {
    throw new Error("Pool account not found");
  }
  const poolState = parsePoolAccount(new Uint8Array(poolAccount.data));
  const root = currentRoot(poolState);

  const path = buildMerklePath(leafIndex, leaves);

  return {
    note: targetNote,
    leafIndex: BigInt(leafIndex),
    path,
    root,
  };
}
