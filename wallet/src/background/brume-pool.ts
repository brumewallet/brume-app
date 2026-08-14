
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  deriveCommitment,
  derivePool,
  deriveVault,
  initializePoolIx,
  LocalTeeSigner,
  POOL_PROGRAM_ID,
  type Note,
} from "@brume/sdk";
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

// A note is spendable iff its commitment PDA exists on chain — no tree, no proof.
export async function isNoteSpendable(
  connection: Connection,
  commitment: Uint8Array,
): Promise<boolean> {
  const [commitmentAccount] = deriveCommitment(Buffer.from(commitment));
  const info = await connection.getAccountInfo(commitmentAccount, "confirmed");
  return info?.owner.equals(POOL_PROGRAM_ID) ?? false;
}
