// devnet hero-flow smoke test
//
// creates a test mint, initializes a pool, shields 100 tokens (full 4-tx
// flow including the note announcement), then unshields them to a second
// wallet via a relayer-style payer. exercises every pool instruction except
// private transfer against the live devnet deployment.
//
// run: bun scripts/devnet-smoke.ts

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  mintTo,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import {
  buildShieldTxs,
  buildUnshieldTx,
  derivePool,
  deriveVault,
  emptyLeaf,
  hashPair,
  initializePoolIx,
  randomNote,
  LocalTeeSigner,
  TREE_DEPTH,
  XWING_CIPHERTEXT_SIZE,
  type SpendWitness,
} from "../src/index";

const RPC = "https://api.devnet.solana.com";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(path, "utf8"))));
}

// single-leaf tree: root and path for leaf 0 with all-empty siblings
function singleLeafWitnessParts(leaf: Uint8Array): { root: Uint8Array; path: Uint8Array[] } {
  const path: Uint8Array[] = [];
  let node = leaf;
  let zero = emptyLeaf();
  for (let level = 0; level < TREE_DEPTH; level++) {
    path.push(zero);
    node = hashPair(node, zero);
    zero = hashPair(zero, zero);
  }
  return { root: node, path };
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const payer = loadKeypair(`${homedir()}/.config/solana/id.json`);
  const teeSecret = new Uint8Array(
    JSON.parse(readFileSync(new URL("../../keys/brume_dev_tee-keypair.json", import.meta.url), "utf8")),
  ).slice(0, 32);
  const tee = new LocalTeeSigner(teeSecret);

  console.log("payer:", payer.publicKey.toBase58());

  // 1. test mint + funded token account
  const mint = await createMint(connection, payer, payer.publicKey, null, 6);
  console.log("mint:", mint.toBase58());
  const depositorAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );
  await mintTo(connection, payer, mint, depositorAta.address, payer, 1_000_000_000n);
  console.log("minted 1000 tokens to depositor");

  // 2. initialize pool
  const [pool, poolBump] = derivePool(mint);
  const [vault, vaultBump] = deriveVault(mint);
  const initSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      initializePoolIx({ payer: payer.publicKey, pool, poolBump, mint, vault, vaultBump }),
    ),
    [payer],
  );
  console.log("pool initialized:", pool.toBase58(), initSig);

  // 3. shield 100 tokens (4 txs: attested shield + note, 2 chunks, finalize)
  const note = randomNote(100_000_000n, mint);
  const ciphertext = crypto.getRandomValues(new Uint8Array(XWING_CIPHERTEXT_SIZE));
  const { txs: shieldTxs, commitment } = await buildShieldTxs({
    tee,
    depositor: payer.publicKey,
    depositorTokenAccount: depositorAta.address,
    mint,
    note,
    ciphertext,
  });
  for (const [i, tx] of shieldTxs.entries()) {
    const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
    console.log(`shield tx ${i + 1}/4:`, sig);
  }
  console.log("commitment:", Buffer.from(commitment).toString("hex"));

  const vaultAfterShield = await getAccount(connection, vault);
  console.log("vault balance after shield:", vaultAfterShield.amount.toString());
  if (vaultAfterShield.amount !== 100_000_000n) throw new Error("vault balance wrong");

  // 4. unshield to a fresh recipient, paid by the same payer (relayer role)
  const recipient = Keypair.generate();
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    recipient.publicKey,
  );

  const { root, path } = singleLeafWitnessParts(commitment);
  const witness: SpendWitness = { note, leafIndex: 0n, path, root };

  const { tx: unshieldTx } = await buildUnshieldTx({
    tee,
    payer: payer.publicKey,
    mint,
    recipientTokenAccount: recipientAta.address,
    witness,
  });
  const unshieldSig = await sendAndConfirmTransaction(connection, unshieldTx, [payer]);
  console.log("unshield tx:", unshieldSig);

  const recipientAfter = await getAccount(connection, recipientAta.address);
  const vaultAfter = await getAccount(connection, vault);
  console.log("recipient balance:", recipientAfter.amount.toString());
  console.log("vault balance:", vaultAfter.amount.toString());
  if (recipientAfter.amount !== 100_000_000n) throw new Error("recipient balance wrong");
  if (vaultAfter.amount !== 0n) throw new Error("vault not emptied");

  // 5. double spend must fail
  let doubleSpendRejected = false;
  try {
    const { tx: replay } = await buildUnshieldTx({
      tee,
      payer: payer.publicKey,
      mint,
      recipientTokenAccount: recipientAta.address,
      witness,
    });
    await sendAndConfirmTransaction(connection, replay, [payer]);
  } catch {
    doubleSpendRejected = true;
  }
  if (!doubleSpendRejected) throw new Error("double spend was not rejected");
  console.log("double spend rejected as expected");

  console.log("\nSMOKE TEST PASSED: shield -> unshield end to end on devnet");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
