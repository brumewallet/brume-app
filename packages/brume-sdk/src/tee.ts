// tee client
//
// production: the wallet talks to the magicblock tee over an attested
// encrypted channel (HttpTeeClient). development: LocalTeeSigner signs with
// the dev key baked into the devnet program build, so the whole flow runs
// without an enclave.

import { ed25519 } from "@noble/curves/ed25519";

import { ATTESTATION_SIZE } from "./constants";
import { concat, i64le } from "./hash";
import {
  shieldMessage,
  splitTransferMessage,
  transferMessage,
  unshieldMessage,
} from "./messages";
import { Note, noteCommitment, noteNullifier } from "./notes";

export interface Attestation {
  message: Uint8Array;
  signature: Uint8Array; // 64 bytes
  timestamp: bigint;
}

// the 72-byte payload embedded in pool instruction data
export function attestationPayload(att: Attestation): Uint8Array {
  const out = concat(att.signature, i64le(att.timestamp));
  if (out.length !== ATTESTATION_SIZE) {
    throw new Error("bad attestation payload size");
  }
  return out;
}

export interface SpendWitness {
  note: Note;
  leafIndex: bigint;
  path: Uint8Array[]; // TREE_DEPTH siblings
  root: Uint8Array;
}

export interface TeeClient {
  attestShield(note: Note): Promise<Attestation>;
  attestUnshield(
    witness: SpendWitness,
    recipientTokenAccount: Uint8Array,
    amount: bigint,
  ): Promise<Attestation>;
  attestTransfer(witness: SpendWitness, output: Note): Promise<Attestation>;
  attestSplitTransfer(
    witness: SpendWitness,
    recipientOutput: Note,
    changeOutput: Note,
  ): Promise<Attestation>;
}

// dev signer mirroring crates/brume-prover. witness checks are skipped here
// because the wallet is proving to itself; the on-chain program still
// enforces roots and nullifiers.
export class LocalTeeSigner implements TeeClient {
  constructor(private readonly secretKey: Uint8Array) {
    if (secretKey.length !== 32) {
      throw new Error("expected 32-byte ed25519 secret");
    }
  }

  publicKey(): Uint8Array {
    return ed25519.getPublicKey(this.secretKey);
  }

  private sign(message: Uint8Array, timestamp: bigint): Attestation {
    return {
      message,
      signature: ed25519.sign(message, this.secretKey),
      timestamp,
    };
  }

  private now(): bigint {
    return BigInt(Math.floor(Date.now() / 1000));
  }

  async attestShield(note: Note): Promise<Attestation> {
    const ts = this.now();
    const msg = shieldMessage(noteCommitment(note), note.mint, note.amount, ts);
    return this.sign(msg, ts);
  }

  async attestUnshield(
    witness: SpendWitness,
    recipientTokenAccount: Uint8Array,
    amount: bigint,
  ): Promise<Attestation> {
    if (amount !== witness.note.amount) {
      throw new Error("v1 spends the full note; amount must match");
    }
    const ts = this.now();
    const msg = unshieldMessage(
      noteNullifier(witness.note),
      witness.root,
      witness.note.mint,
      recipientTokenAccount,
      amount,
      ts,
    );
    return this.sign(msg, ts);
  }

  async attestTransfer(witness: SpendWitness, output: Note): Promise<Attestation> {
    if (output.amount !== witness.note.amount) {
      throw new Error("v1 transfers the full note; amounts must match");
    }
    const ts = this.now();
    const msg = transferMessage(
      noteNullifier(witness.note),
      noteCommitment(output),
      witness.root,
      ts,
    );
    return this.sign(msg, ts);
  }

  async attestSplitTransfer(
    witness: SpendWitness,
    recipientOutput: Note,
    changeOutput: Note,
  ): Promise<Attestation> {
    if (recipientOutput.amount === 0n || changeOutput.amount === 0n) {
      throw new Error("split transfer: both output amounts must be positive");
    }
    if (recipientOutput.amount + changeOutput.amount !== witness.note.amount) {
      throw new Error("split transfer: recipient + change must equal input amount");
    }
    const ts = this.now();
    const msg = splitTransferMessage(
      noteNullifier(witness.note),
      noteCommitment(recipientOutput),
      noteCommitment(changeOutput),
      witness.root,
      ts,
    );
    return this.sign(msg, ts);
  }
}

// production client; endpoint contract to be pinned when the enclave
// service ships. the witness travels over the tee's encrypted channel.
export class HttpTeeClient implements TeeClient {
  constructor(private readonly baseUrl: string) {}

  private async post(path: string, body: unknown): Promise<Attestation> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body, (_k, v) =>
        typeof v === "bigint"
          ? v.toString()
          : v instanceof Uint8Array
            ? Buffer.from(v).toString("base64")
            : v,
      ),
    });
    if (!res.ok) {
      throw new Error(`tee request failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      message: string;
      signature: string;
      timestamp: string;
    };
    return {
      message: new Uint8Array(Buffer.from(json.message, "base64")),
      signature: new Uint8Array(Buffer.from(json.signature, "base64")),
      timestamp: BigInt(json.timestamp),
    };
  }

  attestShield(note: Note): Promise<Attestation> {
    return this.post("/attest/shield", { note });
  }

  attestUnshield(
    witness: SpendWitness,
    recipientTokenAccount: Uint8Array,
    amount: bigint,
  ): Promise<Attestation> {
    return this.post("/attest/unshield", {
      witness,
      recipientTokenAccount,
      amount,
    });
  }

  attestTransfer(witness: SpendWitness, output: Note): Promise<Attestation> {
    return this.post("/attest/transfer", { witness, output });
  }

  attestSplitTransfer(
    witness: SpendWitness,
    recipientOutput: Note,
    changeOutput: Note,
  ): Promise<Attestation> {
    return this.post("/attest/split-transfer", { witness, recipientOutput, changeOutput });
  }
}
