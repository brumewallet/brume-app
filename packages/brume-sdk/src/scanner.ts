// note scanning
//
// fetches finalized note announcements, filters by view tag, and hands
// ciphertexts to the wallet's x-wing decryptor. decryption stays outside the
// sdk: the wallet owns key material (keyring worker in the extension).

import { Connection, PublicKey } from "@solana/web3.js";

import {
  NOTE_ACCOUNT_DISCRIMINATOR,
  NOTE_ACCOUNT_SIZE,
  POOL_PROGRAM_ID,
  XWING_CIPHERTEXT_SIZE,
} from "./constants";

// note account layout offsets (crates/brume-pool/src/state/note.rs)
const OFF_VIEW_TAG = 9;
const OFF_IS_FINALIZED = 10;
const OFF_SENDER = 16;
const OFF_POOL = 48;
const OFF_COMMITMENT = 80;
const OFF_CREATED_AT = 112;
const OFF_CIPHERTEXT = 120;

export interface NoteAnnouncement {
  address: PublicKey;
  viewTag: number;
  sender: PublicKey;
  pool: PublicKey;
  commitment: Uint8Array;
  createdAt: bigint;
  ciphertext: Uint8Array;
}

export function parseNoteAccount(
  address: PublicKey,
  data: Uint8Array,
): NoteAnnouncement | null {
  if (data.length < NOTE_ACCOUNT_SIZE) return null;
  const disc = new TextDecoder().decode(data.slice(0, 8));
  if (disc !== NOTE_ACCOUNT_DISCRIMINATOR) return null;
  if (data[OFF_IS_FINALIZED] !== 1) return null;
  return {
    address,
    viewTag: data[OFF_VIEW_TAG]!,
    sender: new PublicKey(data.slice(OFF_SENDER, OFF_SENDER + 32)),
    pool: new PublicKey(data.slice(OFF_POOL, OFF_POOL + 32)),
    commitment: data.slice(OFF_COMMITMENT, OFF_COMMITMENT + 32),
    createdAt: new DataView(data.buffer, data.byteOffset + OFF_CREATED_AT).getBigInt64(0, true),
    ciphertext: data.slice(OFF_CIPHERTEXT, OFF_CIPHERTEXT + XWING_CIPHERTEXT_SIZE),
  };
}

// a decryptor returns the 104-byte note plaintext or null when the
// ciphertext is not addressed to this wallet
export type NoteDecryptor = (ciphertext: Uint8Array) => Promise<Uint8Array | null>;

export async function scanNotes(
  connection: Connection,
  decrypt: NoteDecryptor,
  options?: {
    pool?: PublicKey;
    // wallet-derived candidate view tags; skips decryption for the rest
    viewTags?: Set<number>;
  },
): Promise<Array<{ announcement: NoteAnnouncement; plaintext: Uint8Array }>> {
  const accounts = await connection.getProgramAccounts(POOL_PROGRAM_ID, {
    filters: [{ dataSize: NOTE_ACCOUNT_SIZE }],
  });

  const found: Array<{ announcement: NoteAnnouncement; plaintext: Uint8Array }> = [];
  for (const { pubkey, account } of accounts) {
    const parsed = parseNoteAccount(pubkey, new Uint8Array(account.data));
    if (!parsed) continue;
    if (options?.pool && !parsed.pool.equals(options.pool)) continue;
    if (options?.viewTags && !options.viewTags.has(parsed.viewTag)) continue;
    const plaintext = await decrypt(parsed.ciphertext);
    if (plaintext) {
      found.push({ announcement: parsed, plaintext });
    }
  }
  return found;
}
