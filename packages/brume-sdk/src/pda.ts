// pda derivations for both programs

import { PublicKey } from "@solana/web3.js";

import {
  NOTE_SEED,
  NULLIFIER_SEED,
  POOL_PROGRAM_ID,
  POOL_SEED,
  REGISTRY_PROGRAM_ID,
  REGISTRY_SEED,
  VAULT_SEED,
} from "./constants";

const encoder = new TextEncoder();

export function derivePool(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(POOL_SEED), mint.toBytes()],
    POOL_PROGRAM_ID,
  );
}

export function deriveVault(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(VAULT_SEED), mint.toBytes()],
    POOL_PROGRAM_ID,
  );
}

export function deriveNullifier(
  pool: PublicKey,
  nullifier: Uint8Array,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(NULLIFIER_SEED), pool.toBytes(), nullifier],
    POOL_PROGRAM_ID,
  );
}

export function deriveNote(commitment: Uint8Array): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(NOTE_SEED), commitment],
    POOL_PROGRAM_ID,
  );
}

export function deriveRegistry(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [encoder.encode(REGISTRY_SEED), owner.toBytes()],
    REGISTRY_PROGRAM_ID,
  );
}
