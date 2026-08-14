import { x25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";
import { decryptNote, encryptNoteForRecipient } from "./brume-xwing";
import { NOTE_PLAINTEXT_SIZE, XWING_PUBLIC_KEY_SIZE } from "./note-crypto-types";

describe("brume-xwing", () => {
  it("round-trips a note plaintext through encrypt/decrypt", async () => {
    const secretKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKey = x25519.getPublicKey(secretKey);

    // recipientRegistryKey is the on-chain-shaped, zero-padded registry entry buildRegistryPublicKey produces.
    const registryKey = new Uint8Array(XWING_PUBLIC_KEY_SIZE);
    registryKey.set(publicKey, 0);

    const plaintext = crypto.getRandomValues(new Uint8Array(NOTE_PLAINTEXT_SIZE));
    const ciphertext = await encryptNoteForRecipient(plaintext, registryKey);
    const decrypted = await decryptNote(ciphertext, secretKey, publicKey);

    expect(decrypted).toEqual(plaintext);
  });
});
