
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { NOTE_PLAINTEXT_SIZE, XWING_CIPHERTEXT_SIZE, XWING_PUBLIC_KEY_SIZE } from "@brume/sdk";
import type { NoteDecryptor } from "@brume/sdk";

const EPK_OFFSET = 0;
const EPK_SIZE = 32;
const NONCE_OFFSET = EPK_SIZE;
const NONCE_SIZE = 12;
const CT_OFFSET = NONCE_OFFSET + NONCE_SIZE;
const CT_SIZE = NOTE_PLAINTEXT_SIZE;
const TAG_SIZE = 16;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// HKDF-SHA-256 wrapper using @noble/hashes (available in the wallet already).
function hkdfSha256(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: string,
  length: number,
): Uint8Array {
  return hkdf(sha256, inputKeyMaterial, salt, info, length);
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

const XWING_KP_PREFIX = "brume_xwing_kp_v1_";

interface StoredXWingKp {
  secretKey: string;
  publicKey: string;
}

function deriveX25519SecretKey(ed25519SecretKey: Uint8Array): Uint8Array {
  const seed = ed25519SecretKey.slice(0, 32);
  return hkdfSha256(seed, new TextEncoder().encode("brume-xwing-v1-salt"), "brume-xwing-v1-secret", 32);
}

function buildRegistryPublicKey(x25519Pk: Uint8Array): Uint8Array {
  const full = new Uint8Array(XWING_PUBLIC_KEY_SIZE);
  full.set(x25519Pk, 0);
  return full;
}

export async function getOrDeriveXWingKeypair(
  ownerAddress: string,
  ownerSecretKey: Uint8Array,
): Promise<{ secretKey: Uint8Array; publicKey: Uint8Array }> {
  const storageKey = `${XWING_KP_PREFIX}${ownerAddress}`;
  const raw = await chrome.storage.local.get(storageKey);
  const stored = raw[storageKey] as StoredXWingKp | undefined;

  if (stored?.secretKey && stored?.publicKey) {
    return {
      secretKey: hexToBytes(stored.secretKey),
      publicKey: hexToBytes(stored.publicKey),
    };
  }

  const secretKey = deriveX25519SecretKey(ownerSecretKey);
  const x25519Pk = x25519.getPublicKey(secretKey);
  const publicKey = buildRegistryPublicKey(x25519Pk);

  await chrome.storage.local.set({
    [storageKey]: {
      secretKey: bytesToHex(secretKey),
      publicKey: bytesToHex(publicKey),
    } satisfies StoredXWingKp,
  });

  return { secretKey, publicKey };
}

export async function encryptNoteForRecipient(
  notePlaintext: Uint8Array,
  recipientRegistryKey: Uint8Array,
): Promise<Uint8Array> {
  if (notePlaintext.length !== NOTE_PLAINTEXT_SIZE) {
    throw new Error(`Note plaintext must be ${NOTE_PLAINTEXT_SIZE} bytes`);
  }
  if (recipientRegistryKey.length !== XWING_PUBLIC_KEY_SIZE) {
    throw new Error(`Recipient registry key must be ${XWING_PUBLIC_KEY_SIZE} bytes`);
  }

  const recipientX25519Pk = recipientRegistryKey.slice(0, 32);

  const ephemeralSk = crypto.getRandomValues(new Uint8Array(32));
  const ephemeralPk = x25519.getPublicKey(ephemeralSk);

  const sharedSecret = x25519.getSharedSecret(ephemeralSk, recipientX25519Pk);

  const keyBytes = hkdfSha256(sharedSecret, recipientX25519Pk, "brume-note-v1", 32);
  const cryptoKey = await importAesKey(keyBytes);

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));

  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    cryptoKey,
    notePlaintext,
  );
  const encrypted = new Uint8Array(encryptedBuf);
  const ct = encrypted.slice(0, CT_SIZE);
  const tag = encrypted.slice(CT_SIZE);

  const out = new Uint8Array(XWING_CIPHERTEXT_SIZE);
  out.set(ephemeralPk, EPK_OFFSET);
  out.set(nonce, NONCE_OFFSET);
  out.set(ct, CT_OFFSET);
  out.set(tag, CT_OFFSET + CT_SIZE);

  return out;
}

export async function decryptNote(
  ciphertext: Uint8Array,
  recipientX25519Sk: Uint8Array,
  recipientX25519Pk: Uint8Array,
): Promise<Uint8Array | null> {
  if (ciphertext.length < XWING_CIPHERTEXT_SIZE) return null;

  const ephemeralPk = ciphertext.slice(EPK_OFFSET, EPK_OFFSET + EPK_SIZE);
  const nonce = ciphertext.slice(NONCE_OFFSET, NONCE_OFFSET + NONCE_SIZE);
  const ctWithTag = ciphertext.slice(CT_OFFSET, CT_OFFSET + CT_SIZE + TAG_SIZE);

  if (ephemeralPk.every((b) => b === 0)) return null;

  try {
    const sharedSecret = x25519.getSharedSecret(recipientX25519Sk, ephemeralPk);
    const keyBytes = hkdfSha256(sharedSecret, recipientX25519Pk, "brume-note-v1", 32);
    const cryptoKey = await importAesKey(keyBytes);

    const plaintextBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      ctWithTag,
    );
    return new Uint8Array(plaintextBuf);
  } catch {
    return null;
  }
}

export function makeNoteDecryptor(
  x25519SecretKey: Uint8Array,
  x25519PublicKey: Uint8Array,
): NoteDecryptor {
  return async (ciphertext: Uint8Array): Promise<Uint8Array | null> => {
    const recipientX25519Pk = x25519PublicKey.slice(0, 32);
    return decryptNote(ciphertext, x25519SecretKey, recipientX25519Pk);
  };
}
