// Keystore round-trips, rejects a wrong password, and still opens wallets made with 100k iterations.
import { describe, expect, it } from "vitest";
import { decryptSecretKey, encryptSecretKey } from "@/shared/keystore";

const secret = new Uint8Array(64).map((_, i) => i);

describe("keystore", () => {
  it("encrypts new keys with 600k PBKDF2 iterations and decrypts them", async () => {
    const ks = await encryptSecretKey("correct horse", secret, "addr");
    expect(ks.crypto.kdfparams.iterations).toBe(600_000);
    expect(await decryptSecretKey("correct horse", ks)).toEqual(secret);
  });

  it("rejects a wrong password", async () => {
    const ks = await encryptSecretKey("correct horse", secret, "addr");
    await expect(decryptSecretKey("wrong horse", ks)).rejects.toThrow();
  });

  it("opens a keystore made with the old 100k count", async () => {
    // Re-create a legacy keystore: same format, iterations recorded as 100k.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode("pw-legacy"), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const full = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, secret));
    const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
    const legacy = {
      version: 1 as const,
      crypto: {
        cipher: "aes-256-gcm" as const,
        ciphertext: hex(full.subarray(0, full.length - 16)),
        cipherparams: { iv: hex(iv) },
        authTag: hex(full.subarray(full.length - 16)),
        kdf: "pbkdf2" as const,
        kdfparams: { dklen: 32, salt: hex(salt), iterations: 100_000, digest: "SHA-256" as const },
      },
      address: "addr",
    };
    expect(await decryptSecretKey("pw-legacy", legacy)).toEqual(secret);
  });
});
