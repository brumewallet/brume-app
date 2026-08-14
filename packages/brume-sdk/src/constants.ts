// program ids, seeds, sizes, and domain tags
//
// every value here mirrors crates/brume-types/src/lib.rs. if a constant
// changes there, it changes here in the same commit.

import { PublicKey } from "@solana/web3.js";

export const POOL_PROGRAM_ID = new PublicKey(
  "5tocqbLDq6S5Xy91CAiocGwxTaTiQkuhVJTi625de7hk",
);
export const REGISTRY_PROGRAM_ID = new PublicKey(
  "DFQzK7PrxRvf7fjcNU9NJUVNJXmhD5Y2BodB6EZFztPZ",
);

// dev tee signer (keys/brume_dev_tee-keypair.json); rotated for production
export const TEE_AUTHORITY = new PublicKey(
  "Eh3NgqMMDfY9RtrxQySt6ppNsnBBaXdduYPzDucT3RH6",
);

export const ENCLAVE_MEASUREMENT = new Uint8Array(32);
{
  const tag = new TextEncoder().encode("BrumeTEE:v1");
  ENCLAVE_MEASUREMENT.set(tag, 0);
  ENCLAVE_MEASUREMENT[31] = 0x01;
}

// x-wing sizes
export const XWING_PUBLIC_KEY_SIZE = 1216;
export const XWING_CIPHERTEXT_SIZE = 1120;
export const MAX_CHUNK_SIZE = 700;

// tree
export const TREE_DEPTH = 20;
export const ROOT_HISTORY_SIZE = 32;

// attestation
export const ATTESTATION_SIZE = 72;

// pda seeds
export const POOL_SEED = "pool";
export const VAULT_SEED = "vault";
export const NULLIFIER_SEED = "nullifier";
export const NOTE_SEED = "note";
export const REGISTRY_SEED = "registry";

// domain tags
export const NOTE_DOMAIN = "BRUME:NOTE:V1";
export const NULLIFIER_DOMAIN = "BRUME:NULLIFIER:V1";
export const EMPTY_LEAF_DOMAIN = "BRUME:EMPTY:V1";
export const SHIELD_MSG_DOMAIN = "BRUME:SHIELD:V1";
export const UNSHIELD_MSG_DOMAIN = "BRUME:UNSHIELD:V1";
export const TRANSFER_MSG_DOMAIN = "BRUME:TRANSFER:V1";
export const SPLIT_TRANSFER_MSG_DOMAIN = "BRUME:SPLIT_TRANSFER:V1";

// account sizes (bytes)
export const POOL_ACCOUNT_SIZE = 1754;
export const NOTE_ACCOUNT_SIZE = 1240;
export const NULLIFIER_ACCOUNT_SIZE = 56;
export const REGISTRY_ACCOUNT_SIZE = 1260;

// account discriminators
export const POOL_ACCOUNT_DISCRIMINATOR = "BRUMPOOL";
export const NOTE_ACCOUNT_DISCRIMINATOR = "BRUMNOTE";
export const NULLIFIER_ACCOUNT_DISCRIMINATOR = "BRUMNULL";
export const REGISTRY_ACCOUNT_DISCRIMINATOR = "BRUMEREG";

// instruction discriminators (8 bytes, first byte is the op)
function disc(op: number): Uint8Array {
  const d = new Uint8Array(8);
  d[0] = op;
  return d;
}

export const POOL_IX = {
  initializePool: disc(0x01),
  shield: disc(0x02),
  unshield: disc(0x03),
  transfer: disc(0x04),
  initializeNote: disc(0x05),
  uploadNoteChunk: disc(0x06),
  finalizeNote: disc(0x07),
  splitTransfer: disc(0x08),
} as const;

export const REGISTRY_IX = {
  initializeRegistry: disc(0x01),
  uploadKeyChunk: disc(0x02),
  finalizeRegistry: disc(0x03),
  closeRegistry: disc(0x04),
} as const;
