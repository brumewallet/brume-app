// flow builders: transaction shapes and local tee signing

import { describe, expect, test } from "bun:test";

import { Keypair, PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";

import {
  ATTESTATION_SIZE,
  XWING_CIPHERTEXT_SIZE,
  XWING_PUBLIC_KEY_SIZE,
} from "../src/constants";
import {
  buildRegistrationTxs,
  buildShieldTxs,
  buildTransferTxs,
  buildUnshieldTx,
} from "../src/flows";
import { emptyRoot } from "../src/hash";
import { randomNote } from "../src/notes";
import { deriveRegistry } from "../src/pda";
import { attestationPayload, LocalTeeSigner, type SpendWitness } from "../src/tee";
import { TREE_DEPTH } from "../src/constants";

const teeSecret = crypto.getRandomValues(new Uint8Array(32));
const tee = new LocalTeeSigner(teeSecret);
const wallet = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const tokenAccount = Keypair.generate().publicKey;
const ciphertext = new Uint8Array(XWING_CIPHERTEXT_SIZE).fill(0xcd);

function fakeWitness(note: ReturnType<typeof randomNote>): SpendWitness {
  return {
    note,
    leafIndex: 0n,
    path: Array.from({ length: TREE_DEPTH }, () => new Uint8Array(32)),
    root: emptyRoot(),
  };
}

describe("flows", () => {
  test("registration is 4 txs (init, 2 chunks, finalize)", () => {
    const [registry, bump] = deriveRegistry(wallet);
    const txs = buildRegistrationTxs({
      owner: wallet,
      registry,
      registryBump: bump,
      xwingPublicKey: new Uint8Array(XWING_PUBLIC_KEY_SIZE).fill(0xab),
    });
    expect(txs.length).toBe(4);
  });

  test("shield is 4 txs and tx1 = precompile + shield + init note", async () => {
    const note = randomNote(5_000_000n, mint);
    const { txs, attestation } = await buildShieldTxs({
      tee,
      depositor: wallet,
      depositorTokenAccount: tokenAccount,
      mint,
      note,
      ciphertext,
    });
    expect(txs.length).toBe(4);
    expect(txs[0]!.instructions.length).toBe(3);
    expect(attestationPayload(attestation).length).toBe(ATTESTATION_SIZE);

    // the attestation verifies against the local tee key
    const ok = ed25519.verify(
      attestation.signature,
      attestation.message,
      tee.publicKey(),
    );
    expect(ok).toBe(true);
  });

  test("unshield is a single tx with 2 instructions", async () => {
    const note = randomNote(700n, mint);
    const { tx } = await buildUnshieldTx({
      tee,
      payer: wallet,
      mint,
      recipientTokenAccount: tokenAccount,
      witness: fakeWitness(note),
    });
    expect(tx.instructions.length).toBe(2);
  });

  test("transfer is 4 txs and conserves the amount", async () => {
    const input = randomNote(900n, mint);
    const output = randomNote(900n, mint);
    const { txs } = await buildTransferTxs({
      tee,
      payer: wallet,
      mint,
      witness: fakeWitness(input),
      output,
      ciphertext,
    });
    expect(txs.length).toBe(4);

    const badOutput = randomNote(901n, mint);
    await expect(
      buildTransferTxs({
        tee,
        payer: wallet,
        mint,
        witness: fakeWitness(input),
        output: badOutput,
        ciphertext,
      }),
    ).rejects.toThrow();
  });
});
