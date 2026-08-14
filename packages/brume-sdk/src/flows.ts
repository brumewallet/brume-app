// transaction bundles for the concept's phase 1 flows
//
// key registration: 4 txs. shield: 4 txs. unshield: 1 tx. transfer: 4 txs.
// the caller signs and sends in order; txs 2..4 of a note flow depend on the
// pda created in tx 1.

import { PublicKey, Transaction } from "@solana/web3.js";

import { MAX_CHUNK_SIZE, XWING_CIPHERTEXT_SIZE, XWING_PUBLIC_KEY_SIZE } from "./constants";
import { ed25519VerifyInstruction } from "./ed25519";
import {
  finalizeNoteIx,
  finalizeRegistryIx,
  initializeNoteIx,
  initializeRegistryIx,
  shieldIx,
  splitTransferIx,
  transferIx,
  unshieldIx,
  uploadKeyChunkIx,
  uploadNoteChunkIx,
} from "./instructions";
import { noteCommitment, noteNullifier, viewTag, type Note } from "./notes";
import { deriveNote, deriveNullifier, derivePool, deriveVault } from "./pda";
import type { Attestation, SpendWitness, TeeClient } from "./tee";

function chunked(data: Uint8Array, size: number): Array<{ offset: number; chunk: Uint8Array }> {
  const out: Array<{ offset: number; chunk: Uint8Array }> = [];
  for (let offset = 0; offset < data.length; offset += size) {
    out.push({ offset, chunk: data.slice(offset, offset + size) });
  }
  return out;
}

// one-time setup: register an x-wing public key (4 txs)
export function buildRegistrationTxs(params: {
  owner: PublicKey;
  registry: PublicKey;
  registryBump: number;
  xwingPublicKey: Uint8Array;
}): Transaction[] {
  if (params.xwingPublicKey.length !== XWING_PUBLIC_KEY_SIZE) {
    throw new Error("x-wing public key must be 1216 bytes");
  }
  const txs = [
    new Transaction().add(
      initializeRegistryIx({
        owner: params.owner,
        registry: params.registry,
        registryBump: params.registryBump,
      }),
    ),
  ];
  for (const { offset, chunk } of chunked(params.xwingPublicKey, MAX_CHUNK_SIZE)) {
    txs.push(
      new Transaction().add(
        uploadKeyChunkIx({ owner: params.owner, registry: params.registry, offset, chunk }),
      ),
    );
  }
  txs.push(
    new Transaction().add(
      finalizeRegistryIx({ owner: params.owner, registry: params.registry }),
    ),
  );
  return txs;
}

// note announcement txs 2..4: ciphertext chunks + finalize
function noteAnnouncementTail(
  sender: PublicKey,
  note: PublicKey,
  ciphertext: Uint8Array,
): Transaction[] {
  if (ciphertext.length !== XWING_CIPHERTEXT_SIZE) {
    throw new Error("x-wing ciphertext must be 1120 bytes");
  }
  const txs = chunked(ciphertext, MAX_CHUNK_SIZE).map(({ offset, chunk }) =>
    new Transaction().add(uploadNoteChunkIx({ sender, note, offset, chunk })),
  );
  txs.push(new Transaction().add(finalizeNoteIx({ sender, note })));
  return txs;
}

// shield: public to shielded (1 tee round trip + 4 txs)
export async function buildShieldTxs(params: {
  tee: TeeClient;
  depositor: PublicKey;
  depositorTokenAccount: PublicKey;
  mint: PublicKey;
  note: Note;
  // the note encrypted to the recipient's (or own) x-wing key
  ciphertext: Uint8Array;
}): Promise<{ txs: Transaction[]; attestation: Attestation; commitment: Uint8Array }> {
  const commitment = noteCommitment(params.note);
  const attestation = await params.tee.attestShield(params.note);

  const [pool] = derivePool(params.mint);
  const [vault] = deriveVault(params.mint);
  const [note, noteBump] = deriveNote(commitment);

  const tx1 = new Transaction().add(
    ed25519VerifyInstruction(attestation),
    shieldIx({
      depositor: params.depositor,
      pool,
      vault,
      depositorTokenAccount: params.depositorTokenAccount,
      amount: params.note.amount,
      commitment,
      attestation,
    }),
    initializeNoteIx({
      payer: params.depositor,
      pool,
      note,
      noteBump,
      commitment,
      viewTag: viewTag(commitment),
    }),
  );

  return {
    txs: [tx1, ...noteAnnouncementTail(params.depositor, note, params.ciphertext)],
    attestation,
    commitment,
  };
}

// unshield: shielded to public (1 tee round trip + 1 tx)
export async function buildUnshieldTx(params: {
  tee: TeeClient;
  payer: PublicKey;
  mint: PublicKey;
  recipientTokenAccount: PublicKey;
  witness: SpendWitness;
}): Promise<{ tx: Transaction; attestation: Attestation; nullifier: Uint8Array }> {
  const amount = params.witness.note.amount;
  const nullifier = noteNullifier(params.witness.note);
  const attestation = await params.tee.attestUnshield(
    params.witness,
    params.recipientTokenAccount.toBytes(),
    amount,
  );

  const [pool] = derivePool(params.mint);
  const [vault] = deriveVault(params.mint);
  const [nullifierAccount, nullifierBump] = deriveNullifier(pool, nullifier);

  const tx = new Transaction().add(
    ed25519VerifyInstruction(attestation),
    unshieldIx({
      payer: params.payer,
      pool,
      vault,
      recipientTokenAccount: params.recipientTokenAccount,
      nullifierAccount,
      nullifierBump,
      amount,
      nullifier,
      root: params.witness.root,
      attestation,
    }),
  );

  return { tx, attestation, nullifier };
}

// split transfer: shielded to shielded with change note (1 tee round trip + 6 txs)
//
// spends one input note; creates two output notes: one for the recipient and
// one as change back to the sender. both stay fully inside the pool.
//
// tx layout:
//   1: ed25519Verify + splitTransfer + initializeNote(recipient)
//   2: uploadNoteChunk(recipient, 0..700)
//   3: uploadNoteChunk(recipient, 700..1120) + initializeNote(change)
//   4: finalizeNote(recipient)
//   5: uploadNoteChunk(change, 0..700)
//   6: uploadNoteChunk(change, 700..1120) + finalizeNote(change)
export async function buildSplitTransferTxs(params: {
  tee: TeeClient;
  payer: PublicKey;
  mint: PublicKey;
  witness: SpendWitness;
  recipientOutput: Note;
  changeOutput: Note;
  // recipient note encrypted to recipient's x-wing key
  recipientCiphertext: Uint8Array;
  // change note encrypted to sender's own x-wing key
  changeCiphertext: Uint8Array;
}): Promise<{
  txs: Transaction[];
  attestation: Attestation;
  commitmentRecipient: Uint8Array;
  commitmentChange: Uint8Array;
}> {
  const nullifierIn = noteNullifier(params.witness.note);
  const commitmentRecipient = noteCommitment(params.recipientOutput);
  const commitmentChange = noteCommitment(params.changeOutput);
  const attestation = await params.tee.attestSplitTransfer(
    params.witness,
    params.recipientOutput,
    params.changeOutput,
  );

  const [pool] = derivePool(params.mint);
  const [nullifierAccount, nullifierBump] = deriveNullifier(pool, nullifierIn);
  const [recipientNote, recipientNoteBump] = deriveNote(commitmentRecipient);
  const [changeNote, changeNoteBump] = deriveNote(commitmentChange);

  // Tx 1: ed25519Verify + splitTransfer + initializeNote(recipient)
  const tx1 = new Transaction().add(
    ed25519VerifyInstruction(attestation),
    splitTransferIx({
      payer: params.payer,
      pool,
      nullifierAccount,
      nullifierBump,
      nullifierIn,
      commitmentRecipient,
      commitmentChange,
      root: params.witness.root,
      attestation,
    }),
    initializeNoteIx({
      payer: params.payer,
      pool,
      note: recipientNote,
      noteBump: recipientNoteBump,
      commitment: commitmentRecipient,
      viewTag: viewTag(commitmentRecipient),
    }),
  );

  // Recipient ciphertext chunks
  const recipientChunks = chunked(params.recipientCiphertext, MAX_CHUNK_SIZE);
  // Change ciphertext chunks
  const changeChunks = chunked(params.changeCiphertext, MAX_CHUNK_SIZE);

  // Tx 2: uploadNoteChunk(recipient, chunk 0)
  const tx2 = new Transaction().add(
    uploadNoteChunkIx({
      sender: params.payer,
      note: recipientNote,
      offset: recipientChunks[0]!.offset,
      chunk: recipientChunks[0]!.chunk,
    }),
  );

  // Tx 3: uploadNoteChunk(recipient, chunk 1) + initializeNote(change)
  const tx3 = new Transaction().add(
    uploadNoteChunkIx({
      sender: params.payer,
      note: recipientNote,
      offset: recipientChunks[1]!.offset,
      chunk: recipientChunks[1]!.chunk,
    }),
    initializeNoteIx({
      payer: params.payer,
      pool,
      note: changeNote,
      noteBump: changeNoteBump,
      commitment: commitmentChange,
      viewTag: viewTag(commitmentChange),
    }),
  );

  // Tx 4: finalizeNote(recipient)
  const tx4 = new Transaction().add(
    finalizeNoteIx({ sender: params.payer, note: recipientNote }),
  );

  // Tx 5: uploadNoteChunk(change, chunk 0)
  const tx5 = new Transaction().add(
    uploadNoteChunkIx({
      sender: params.payer,
      note: changeNote,
      offset: changeChunks[0]!.offset,
      chunk: changeChunks[0]!.chunk,
    }),
  );

  // Tx 6: uploadNoteChunk(change, chunk 1) + finalizeNote(change)
  const tx6 = new Transaction().add(
    uploadNoteChunkIx({
      sender: params.payer,
      note: changeNote,
      offset: changeChunks[1]!.offset,
      chunk: changeChunks[1]!.chunk,
    }),
    finalizeNoteIx({ sender: params.payer, note: changeNote }),
  );

  return {
    txs: [tx1, tx2, tx3, tx4, tx5, tx6],
    attestation,
    commitmentRecipient,
    commitmentChange,
  };
}

// private transfer: shielded to shielded (1 tee round trip + 4 txs)
export async function buildTransferTxs(params: {
  tee: TeeClient;
  payer: PublicKey;
  mint: PublicKey;
  witness: SpendWitness;
  output: Note;
  // the output note encrypted to the recipient's x-wing key
  ciphertext: Uint8Array;
}): Promise<{ txs: Transaction[]; attestation: Attestation; commitmentOut: Uint8Array }> {
  const nullifierIn = noteNullifier(params.witness.note);
  const commitmentOut = noteCommitment(params.output);
  const attestation = await params.tee.attestTransfer(params.witness, params.output);

  const [pool] = derivePool(params.mint);
  const [nullifierAccount, nullifierBump] = deriveNullifier(pool, nullifierIn);
  const [note, noteBump] = deriveNote(commitmentOut);

  const tx1 = new Transaction().add(
    ed25519VerifyInstruction(attestation),
    transferIx({
      payer: params.payer,
      pool,
      nullifierAccount,
      nullifierBump,
      nullifierIn,
      commitmentOut,
      root: params.witness.root,
      attestation,
    }),
    initializeNoteIx({
      payer: params.payer,
      pool,
      note,
      noteBump,
      commitment: commitmentOut,
      viewTag: viewTag(commitmentOut),
    }),
  );

  return {
    txs: [tx1, ...noteAnnouncementTail(params.payer, note, params.ciphertext)],
    attestation,
    commitmentOut,
  };
}
