import type { StoredKeystore } from "./types";
import { bytesToHex, hexToBytes, randomBytes } from "./crypto";

const PBKDF2_ITERATIONS = 100_000;

function encoder(): TextEncoder {
  return new TextEncoder();
}

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSecretKey(
  password: string,
  secretKey64: Uint8Array,
  publicKeyBase58: string,
): Promise<StoredKeystore> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const aesKey = await deriveAesKey(password, salt);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    secretKey64,
  );
  const full = new Uint8Array(ciphertextBuf);
  const tagLength = 16;
  const cipherBody = full.subarray(0, full.length - tagLength);
  const authTag = full.subarray(full.length - tagLength);

  return {
    version: 1,
    crypto: {
      cipher: "aes-256-gcm",
      ciphertext: bytesToHex(cipherBody),
      cipherparams: { iv: bytesToHex(iv) },
      authTag: bytesToHex(authTag),
      kdf: "pbkdf2",
      kdfparams: {
        dklen: 32,
        salt: bytesToHex(salt),
        iterations: PBKDF2_ITERATIONS,
        digest: "SHA-256",
      },
    },
    address: publicKeyBase58,
  };
}

export async function decryptSecretKey(
  password: string,
  keystore: StoredKeystore,
): Promise<Uint8Array> {
  const salt = hexToBytes(keystore.crypto.kdfparams.salt);
  const iv = hexToBytes(keystore.crypto.cipherparams.iv);
  const cipherBody = hexToBytes(keystore.crypto.ciphertext);
  const authTag = hexToBytes(keystore.crypto.authTag);
  const combined = new Uint8Array(cipherBody.length + authTag.length);
  combined.set(cipherBody, 0);
  combined.set(authTag, cipherBody.length);

  const aesKey = await deriveAesKey(password, salt);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    combined,
  );
  return new Uint8Array(plain);
}

export async function encryptUtf8(
  password: string,
  text: string,
): Promise<StoredKeystore> {
  const plain = encoder().encode(text);
  return encryptSecretKey(password, plain, "hd:root");
}

export async function decryptUtf8(
  password: string,
  keystore: StoredKeystore,
): Promise<string> {
  const plain = await decryptSecretKey(password, keystore);
  return new TextDecoder().decode(plain);
}
