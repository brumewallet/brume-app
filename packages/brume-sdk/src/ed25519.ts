// ed25519 precompile instruction
//
// every attested pool instruction rides in a transaction whose instruction 0
// is this precompile call; the program introspects it via the instructions
// sysvar.

import { Ed25519Program, TransactionInstruction } from "@solana/web3.js";

import { TEE_AUTHORITY } from "./constants";
import type { Attestation } from "./tee";

export function ed25519VerifyInstruction(
  att: Attestation,
  teeAuthority = TEE_AUTHORITY,
): TransactionInstruction {
  return Ed25519Program.createInstructionWithPublicKey({
    publicKey: teeAuthority.toBytes(),
    message: att.message,
    signature: att.signature,
  });
}
