import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { Keypair } from "@solana/web3.js";
import { decodeBase58 } from "./base58";
import { base64ToBytes, hexToBytes } from "./crypto";
import { deriveEd25519Path } from "./slip10-ed25519";

const DEFAULT_PATH = "m/44'/501'/0'/0'";

// Valid BIP39 lengths per SOLANA_WALLET.md

export function isValidMnemonicWordCount(words: string[]): boolean {
  const n = words.length;
  return [12, 15, 18, 21, 24].includes(n);
}

export function normalizeMnemonic(phrase: string): string {
  return phrase.trim().replace(/\s+/g, " ").toLowerCase();
}

export function createMnemonic12(): string {
  return generateMnemonic(wordlist, 128);
}

export function validateMnemonicPhrase(phrase: string): boolean {
  const normalized = normalizeMnemonic(phrase);
  return validateMnemonic(normalized, wordlist);
}

export function keypairFromMnemonic(
  phrase: string,
  path: string = DEFAULT_PATH,
): Keypair {
  const normalized = normalizeMnemonic(phrase);
  if (!validateMnemonicPhrase(normalized)) {
    throw new Error("Invalid recovery phrase");
  }
  const seed = mnemonicToSeedSync(normalized);
  const seed32 = deriveEd25519Path(path, seed);
  return Keypair.fromSeed(seed32);
}

export function pathsForAccounts(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `m/44'/501'/${i}'/0'`);
}

// (Brume export), hex (64 or 128 chars), JSON byte array `[0,1,…]` (32 or 64),
// or space/comma-separated decimals. Optional JSON object with a string field
// like `privateKey` / `secretKey`.

export function parseSecretKeyImportInput(raw: string, depth = 0): Uint8Array {
  if (depth > 4) {
    throw new Error("Invalid private key");
  }

  let t = raw.trim();
  if (!t) {
    throw new Error("Private key is empty");
  }
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }

  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        const rec = o as Record<string, unknown>;
        for (const k of [
          "privateKey",
          "secretKey",
          "secret",
          "key",
          "private_key",
        ]) {
          const v = rec[k];
          if (typeof v === "string" && v.trim()) {
            return parseSecretKeyImportInput(v, depth + 1);
          }
          if (Array.isArray(v) && (v.length === 32 || v.length === 64)) {
            return parseSecretKeyImportInput(JSON.stringify(v), depth + 1);
          }
        }
      }
    } catch {
            // fall through

    }
  }

  if (t.startsWith("[") && t.endsWith("]")) {
    let arr: unknown;
    try {
      arr = JSON.parse(t) as unknown;
    } catch {
      throw new Error("Invalid JSON array");
    }
    if (
      !Array.isArray(arr) ||
      (arr.length !== 32 && arr.length !== 64)
    ) {
      throw new Error("JSON key must be 32 or 64 byte values");
    }
    for (const x of arr) {
      if (
        typeof x !== "number" ||
        !Number.isInteger(x) ||
        x < 0 ||
        x > 255
      ) {
        throw new Error("Invalid byte in key array");
      }
    }
    return Uint8Array.from(arr as number[]);
  }

  const hex = t.replace(/^0x/i, "").replace(/\s+/g, "");
  if (
    /^[0-9a-fA-F]+$/.test(hex) &&
    (hex.length === 128 || hex.length === 64)
  ) {
    return hexToBytes(hex);
  }

  const compact = t.replace(/\s+/g, "");
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(compact)) {
    try {
      const from58 = decodeBase58(compact);
      if (from58.length === 32 || from58.length === 64) {
        return from58;
      }
    } catch {
            // not valid base58

    }
  }

  try {
    const fromB64 = base64ToBytes(t.replace(/\s+/g, ""));
    if (fromB64.length === 32 || fromB64.length === 64) {
      return fromB64;
    }
  } catch {
        // try comma-separated

  }

  const parts = t.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 32 || parts.length === 64) {
    const nums = parts.map((p) => {
      const n = Number.parseInt(p, 10);
      if (!Number.isInteger(n) || n < 0 || n > 255) {
        throw new Error("Invalid byte in key list");
      }
      return n;
    });
    return Uint8Array.from(nums);
  }

  throw new Error(
    "Could not parse key. Paste Phantom-style Base58, base64, hex (64 or 128 chars), or JSON [byte,…].",
  );
}

export function keypairFromSecretKeyImport(raw: string): Keypair {
  const bytes = parseSecretKeyImportInput(raw);
  if (bytes.length === 64) {
    try {
      return Keypair.fromSecretKey(bytes);
    } catch {
      throw new Error("Invalid 64-byte secret key");
    }
  }
  try {
    return Keypair.fromSeed(bytes);
  } catch {
    throw new Error("Invalid 32-byte seed");
  }
}
