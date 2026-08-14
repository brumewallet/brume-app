// note math matching brume-types
//
// a note is the wallet's private record of a shielded balance. the blinding
// factor is random and cannot be re-derived from the seed, which is why the
// x-wing ciphertext of every note (including self-shields) goes on-chain.

import { PublicKey } from "@solana/web3.js";

import { NOTE_DOMAIN, NULLIFIER_DOMAIN } from "./constants";
import { concat, hashv, u64le } from "./hash";

const encoder = new TextEncoder();

export interface Note {
  amount: bigint;
  mint: Uint8Array; // 32 bytes
  nullifierKey: Uint8Array; // 32 bytes
  blinding: Uint8Array; // 32 bytes
}

export function noteCommitment(note: Note): Uint8Array {
  return hashv([
    encoder.encode(NOTE_DOMAIN),
    u64le(note.amount),
    note.mint,
    note.nullifierKey,
    note.blinding,
  ]);
}

export function noteNullifier(note: Note): Uint8Array {
  return hashv([
    encoder.encode(NULLIFIER_DOMAIN),
    note.nullifierKey,
    noteCommitment(note),
  ]);
}

export function viewTag(commitment: Uint8Array): number {
  return commitment[0]!;
}

export function randomNote(amount: bigint, mint: PublicKey): Note {
  return {
    amount,
    mint: mint.toBytes(),
    nullifierKey: crypto.getRandomValues(new Uint8Array(32)),
    blinding: crypto.getRandomValues(new Uint8Array(32)),
  };
}

// serialized form placed inside the x-wing ciphertext:
// amount (8 le) || mint (32) || nullifier_key (32) || blinding (32)
export const NOTE_PLAINTEXT_SIZE = 104;

export function serializeNote(note: Note): Uint8Array {
  return concat(u64le(note.amount), note.mint, note.nullifierKey, note.blinding);
}

export function deserializeNote(bytes: Uint8Array): Note {
  if (bytes.length < NOTE_PLAINTEXT_SIZE) {
    throw new Error("note plaintext too short");
  }
  return {
    amount: new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(0, true),
    mint: bytes.slice(8, 40),
    nullifierKey: bytes.slice(40, 72),
    blinding: bytes.slice(72, 104),
  };
}
