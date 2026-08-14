
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha2";

const ED25519_SEED = new TextEncoder().encode("ed25519 seed");
const HARDENED_OFFSET = 0x80000000;
const PATH_RE = /^m(\/[0-9]+')+$/;

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function masterFromSeed(seed: Uint8Array): {
  key: Uint8Array;
  chainCode: Uint8Array;
} {
  const I = hmacSha512(ED25519_SEED, seed);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32, 64),
  };
}

function childKey(
  parent: { key: Uint8Array; chainCode: Uint8Array },
  index: number,
): { key: Uint8Array; chainCode: Uint8Array } {
  const indexBuf = new Uint8Array(4);
  new DataView(indexBuf.buffer).setUint32(0, index, false);
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0;
  data.set(parent.key, 1);
  data.set(indexBuf, 33);
  const I = hmacSha512(parent.chainCode, data);
  return {
    key: I.slice(0, 32),
    chainCode: I.slice(32, 64),
  };
}

// 64-byte BIP39 seed → 32-byte Ed25519 seed for Keypair.fromSeed.
export function deriveEd25519Path(path: string, bip39Seed: Uint8Array): Uint8Array {
  if (!PATH_RE.test(path)) {
    throw new Error("Invalid derivation path");
  }
  const segments = path
    .split("/")
    .slice(1)
    .map((s) => s.replace("'", ""))
    .map((el) => parseInt(el, 10));
  if (segments.some((n) => Number.isNaN(n))) {
    throw new Error("Invalid derivation path");
  }
  let node = masterFromSeed(bip39Seed);
  for (const seg of segments) {
    node = childKey(node, seg + HARDENED_OFFSET);
  }
  return node.key;
}
