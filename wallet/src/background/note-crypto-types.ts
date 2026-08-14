// Wallet-side note encryption sizes/types — not on-chain protocol surface, so @brume/sdk doesn't export these.
// Values match packages/brume-sdk's pre-wipe constants.ts/notes.ts/scanner.ts (still on disk, Day 9 deletion pending).

export const NOTE_PLAINTEXT_SIZE = 104;
export const XWING_PUBLIC_KEY_SIZE = 1216;
export const XWING_CIPHERTEXT_SIZE = 1120;

export type NoteDecryptor = (ciphertext: Uint8Array) => Promise<Uint8Array | null>;
