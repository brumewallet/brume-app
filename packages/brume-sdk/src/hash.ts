// sha-256 helpers matching brume-types::hashv

import { sha256 } from "@noble/hashes/sha256";

import { EMPTY_LEAF_DOMAIN, TREE_DEPTH } from "./constants";

const encoder = new TextEncoder();

export function hashv(parts: Uint8Array[]): Uint8Array {
  const hasher = sha256.create();
  for (const p of parts) hasher.update(p);
  return hasher.digest();
}

export function hashPair(left: Uint8Array, right: Uint8Array): Uint8Array {
  return hashv([left, right]);
}

export function emptyLeaf(): Uint8Array {
  return hashv([encoder.encode(EMPTY_LEAF_DOMAIN)]);
}

export function emptyRoot(): Uint8Array {
  let node = emptyLeaf();
  for (let i = 0; i < TREE_DEPTH; i++) {
    node = hashPair(node, node);
  }
  return node;
}

export function u64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

export function i64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, value, true);
  return out;
}

export function u16le(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
