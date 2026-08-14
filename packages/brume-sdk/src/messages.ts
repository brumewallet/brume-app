// tee attestation messages matching brume-types
//
// the wallet builds the same bytes the program rebuilds on-chain; the tee
// signs them. any drift between this file and brume-types breaks every flow,
// which is what sdk/test/parity.test.ts pins.

import {
  ENCLAVE_MEASUREMENT,
  SHIELD_MSG_DOMAIN,
  SPLIT_TRANSFER_MSG_DOMAIN,
  TRANSFER_MSG_DOMAIN,
  UNSHIELD_MSG_DOMAIN,
} from "./constants";
import { concat, i64le, u64le } from "./hash";

const encoder = new TextEncoder();

export function shieldMessage(
  commitment: Uint8Array,
  mint: Uint8Array,
  amount: bigint,
  timestamp: bigint,
): Uint8Array {
  return concat(
    encoder.encode(SHIELD_MSG_DOMAIN),
    commitment,
    mint,
    u64le(amount),
    ENCLAVE_MEASUREMENT,
    i64le(timestamp),
  );
}

export function unshieldMessage(
  nullifier: Uint8Array,
  root: Uint8Array,
  mint: Uint8Array,
  recipientTokenAccount: Uint8Array,
  amount: bigint,
  timestamp: bigint,
): Uint8Array {
  return concat(
    encoder.encode(UNSHIELD_MSG_DOMAIN),
    nullifier,
    root,
    mint,
    recipientTokenAccount,
    u64le(amount),
    ENCLAVE_MEASUREMENT,
    i64le(timestamp),
  );
}

export function transferMessage(
  nullifierIn: Uint8Array,
  commitmentOut: Uint8Array,
  root: Uint8Array,
  timestamp: bigint,
): Uint8Array {
  return concat(
    encoder.encode(TRANSFER_MSG_DOMAIN),
    nullifierIn,
    commitmentOut,
    root,
    ENCLAVE_MEASUREMENT,
    i64le(timestamp),
  );
}

export function splitTransferMessage(
  nullifierIn: Uint8Array,
  commitmentRecipient: Uint8Array,
  commitmentChange: Uint8Array,
  root: Uint8Array,
  timestamp: bigint,
): Uint8Array {
  return concat(
    encoder.encode(SPLIT_TRANSFER_MSG_DOMAIN),
    nullifierIn,
    commitmentRecipient,
    commitmentChange,
    root,
    ENCLAVE_MEASUREMENT,
    i64le(timestamp),
  );
}
