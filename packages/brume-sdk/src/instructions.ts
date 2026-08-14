// instruction builders for the pool and registry programs
//
// account orders and data layouts mirror the process() functions in
// crates/brume-pool and crates/brume-registry exactly.

import {
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

import {
  POOL_IX,
  POOL_PROGRAM_ID,
  REGISTRY_IX,
  REGISTRY_PROGRAM_ID,
} from "./constants";
import { concat, u16le, u64le } from "./hash";
import { attestationPayload, type Attestation } from "./tee";

export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

function ix(
  programId: PublicKey,
  keys: TransactionInstruction["keys"],
  data: Uint8Array,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from(data),
  });
}

// pool program

export function initializePoolIx(params: {
  payer: PublicKey;
  pool: PublicKey;
  poolBump: number;
  mint: PublicKey;
  vault: PublicKey;
  vaultBump: number;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.mint, isSigner: false, isWritable: false },
      { pubkey: params.vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    concat(POOL_IX.initializePool, new Uint8Array([params.poolBump, params.vaultBump])),
  );
}

export function shieldIx(params: {
  depositor: PublicKey;
  pool: PublicKey;
  vault: PublicKey;
  depositorTokenAccount: PublicKey;
  amount: bigint;
  commitment: Uint8Array;
  attestation: Attestation;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.depositor, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.vault, isSigner: false, isWritable: true },
      { pubkey: params.depositorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    concat(
      POOL_IX.shield,
      u64le(params.amount),
      params.commitment,
      attestationPayload(params.attestation),
    ),
  );
}

export function unshieldIx(params: {
  payer: PublicKey;
  pool: PublicKey;
  vault: PublicKey;
  recipientTokenAccount: PublicKey;
  nullifierAccount: PublicKey;
  nullifierBump: number;
  amount: bigint;
  nullifier: Uint8Array;
  root: Uint8Array;
  attestation: Attestation;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: false },
      { pubkey: params.vault, isSigner: false, isWritable: true },
      { pubkey: params.recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: params.nullifierAccount, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    concat(
      POOL_IX.unshield,
      u64le(params.amount),
      params.nullifier,
      params.root,
      new Uint8Array([params.nullifierBump]),
      attestationPayload(params.attestation),
    ),
  );
}

export function transferIx(params: {
  payer: PublicKey;
  pool: PublicKey;
  nullifierAccount: PublicKey;
  nullifierBump: number;
  nullifierIn: Uint8Array;
  commitmentOut: Uint8Array;
  root: Uint8Array;
  attestation: Attestation;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.nullifierAccount, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    concat(
      POOL_IX.transfer,
      params.nullifierIn,
      params.commitmentOut,
      params.root,
      new Uint8Array([params.nullifierBump]),
      attestationPayload(params.attestation),
    ),
  );
}

// split_transfer: 1 input nullifier, 2 output commitments (recipient + change)
export function splitTransferIx(params: {
  payer: PublicKey;
  pool: PublicKey;
  nullifierAccount: PublicKey;
  nullifierBump: number;
  nullifierIn: Uint8Array;
  commitmentRecipient: Uint8Array;
  commitmentChange: Uint8Array;
  root: Uint8Array;
  attestation: Attestation;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: true },
      { pubkey: params.nullifierAccount, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    concat(
      POOL_IX.splitTransfer,
      params.nullifierIn,
      params.commitmentRecipient,
      params.commitmentChange,
      params.root,
      new Uint8Array([params.nullifierBump]),
      attestationPayload(params.attestation),
    ),
  );
}

export function initializeNoteIx(params: {
  payer: PublicKey;
  pool: PublicKey;
  note: PublicKey;
  noteBump: number;
  commitment: Uint8Array;
  viewTag: number;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.payer, isSigner: true, isWritable: true },
      { pubkey: params.pool, isSigner: false, isWritable: false },
      { pubkey: params.note, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    concat(
      POOL_IX.initializeNote,
      params.commitment,
      new Uint8Array([params.viewTag, params.noteBump]),
    ),
  );
}

export function uploadNoteChunkIx(params: {
  sender: PublicKey;
  note: PublicKey;
  offset: number;
  chunk: Uint8Array;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.sender, isSigner: true, isWritable: false },
      { pubkey: params.note, isSigner: false, isWritable: true },
    ],
    concat(POOL_IX.uploadNoteChunk, u16le(params.offset), params.chunk),
  );
}

export function finalizeNoteIx(params: {
  sender: PublicKey;
  note: PublicKey;
}): TransactionInstruction {
  return ix(
    POOL_PROGRAM_ID,
    [
      { pubkey: params.sender, isSigner: true, isWritable: false },
      { pubkey: params.note, isSigner: false, isWritable: true },
    ],
    POOL_IX.finalizeNote,
  );
}

// registry program

export function initializeRegistryIx(params: {
  owner: PublicKey;
  registry: PublicKey;
  registryBump: number;
}): TransactionInstruction {
  return ix(
    REGISTRY_PROGRAM_ID,
    [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: params.registry, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    concat(REGISTRY_IX.initializeRegistry, new Uint8Array([params.registryBump])),
  );
}

export function uploadKeyChunkIx(params: {
  owner: PublicKey;
  registry: PublicKey;
  offset: number;
  chunk: Uint8Array;
}): TransactionInstruction {
  return ix(
    REGISTRY_PROGRAM_ID,
    [
      { pubkey: params.owner, isSigner: true, isWritable: false },
      { pubkey: params.registry, isSigner: false, isWritable: true },
    ],
    concat(REGISTRY_IX.uploadKeyChunk, u16le(params.offset), params.chunk),
  );
}

export function finalizeRegistryIx(params: {
  owner: PublicKey;
  registry: PublicKey;
}): TransactionInstruction {
  return ix(
    REGISTRY_PROGRAM_ID,
    [
      { pubkey: params.owner, isSigner: true, isWritable: false },
      { pubkey: params.registry, isSigner: false, isWritable: true },
    ],
    REGISTRY_IX.finalizeRegistry,
  );
}

export function closeRegistryIx(params: {
  owner: PublicKey;
  registry: PublicKey;
}): TransactionInstruction {
  return ix(
    REGISTRY_PROGRAM_ID,
    [
      { pubkey: params.owner, isSigner: true, isWritable: true },
      { pubkey: params.registry, isSigner: false, isWritable: true },
    ],
    REGISTRY_IX.closeRegistry,
  );
}
