// cross-language parity: these vectors are printed by
// `cargo run -p brume-prover --example vectors` and must never drift.

import { describe, expect, test } from "bun:test";

import { emptyLeaf, emptyRoot, hashPair } from "../src/hash";
import { shieldMessage } from "../src/messages";
import { noteCommitment, noteNullifier, type Note } from "../src/notes";
import { TREE_DEPTH } from "../src/constants";

const VECTORS = {
  emptyLeaf: "98e9539e0c4b4b387cde23145f2106cc8d9807b934e5d3cae6b2dcddab2c5cae",
  emptyRoot: "8e3b6196293651164a68961e15fd8de6abe5f33678429f22f2b5cb21e99f624c",
  commitment: "6b0287e58d85456b58edd542bcc5aa466ee32e6469330488fa9b0aef027053aa",
  nullifier: "d1a35eab36842e5eee15a8e78926e0ee91fbf22aaab475b3e174ba84a9df114c",
  rootAfterOneInsert:
    "555b2d40481844482ecc3f5766b60bad7a49294a67d1cf975deb892b31abda7b",
  shieldMessage:
    "4252554d453a534849454c443a56316b0287e58d85456b58edd542bcc5aa466ee32e6469330488fa9b0aef027053aa070707070707070707070707070707070707070707070707070707070707070740420f00000000004272756d655445453a7631000000000000000000000000000000000000000001c0586a6800000000",
};

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const testNote: Note = {
  amount: 1_000_000n,
  mint: new Uint8Array(32).fill(7),
  nullifierKey: new Uint8Array(32).fill(8),
  blinding: new Uint8Array(32).fill(9),
};

describe("rust/typescript parity", () => {
  test("empty leaf and empty root", () => {
    expect(hex(emptyLeaf())).toBe(VECTORS.emptyLeaf);
    expect(hex(emptyRoot())).toBe(VECTORS.emptyRoot);
  });

  test("note commitment and nullifier", () => {
    expect(hex(noteCommitment(testNote))).toBe(VECTORS.commitment);
    expect(hex(noteNullifier(testNote))).toBe(VECTORS.nullifier);
  });

  test("incremental root after one insert", () => {
    // leaf 0 with all-empty siblings, same math as the on-chain tree
    let node = noteCommitment(testNote);
    let zero = emptyLeaf();
    for (let level = 0; level < TREE_DEPTH; level++) {
      node = hashPair(node, zero);
      zero = hashPair(zero, zero);
    }
    expect(hex(node)).toBe(VECTORS.rootAfterOneInsert);
  });

  test("shield attestation message bytes", () => {
    const msg = shieldMessage(
      noteCommitment(testNote),
      testNote.mint,
      testNote.amount,
      1_751_800_000n,
    );
    expect(hex(msg)).toBe(VECTORS.shieldMessage);
  });
});
