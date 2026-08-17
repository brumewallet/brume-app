
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  deriveXWingKeyAccount,
  openKeyAccountIx,
  writeKeyChunkIx,
  finalizeKeyIx,
  fetchRecipientXWingKey as fetchXWingKeyAccount,
} from "@brume/sdk";
import { XWING_PUBLIC_KEY_SIZE } from "./note-crypto-types";
import type { NetworkId } from "@/shared/constants";
import { getConnection } from "./rpc";
import { detailedTransactionFailureMessage } from "@/shared/errors";
import { serializeUnknownForLog } from "@/shared/errors";

// Mirrors brume_types::XWING_KEY_CHUNK_SIZE — a client-side chunking choice,
// not on-chain protocol surface, so the SDK doesn't export it.
const XWING_KEY_CHUNK_SIZE = 700;

async function sendTxWithConfirmation(
  conn: Connection,
  tx: Transaction,
  signer: Keypair,
  logContext: string,
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);
  const raw = tx.serialize();
  try {
    const sig = await conn.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await conn.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return sig;
  } catch (e) {
    const message = await detailedTransactionFailureMessage(e, conn);
    console.error(
      `[Brume] Registry tx failed (${logContext}): ${JSON.stringify({ error: serializeUnknownForLog(e), detailedMessage: message }, null, 2)}`,
    );
    throw new Error(message);
  }
}

export async function isXWingRegistered(
  conn: Connection,
  owner: PublicKey,
): Promise<boolean> {
  return (await fetchXWingKeyAccount(conn, owner)) !== null;
}

export async function registerXWingKey(params: {
  network: NetworkId;
  from: Keypair;
  xwingPublicKey: Uint8Array;
  rpcUrlOverride?: string | null;
}): Promise<{ signature: string }> {
  if (params.xwingPublicKey.length !== XWING_PUBLIC_KEY_SIZE) {
    throw new Error(`X-Wing public key must be ${XWING_PUBLIC_KEY_SIZE} bytes`);
  }

  const conn = getConnection(params.network, params.rpcUrlOverride);
  const owner = params.from.publicKey;
  const [keyAccount, bump] = deriveXWingKeyAccount(owner);
  const key = Buffer.from(params.xwingPublicKey);

  const steps: [string, ReturnType<typeof openKeyAccountIx>][] = [
    ["openKeyAccount", openKeyAccountIx({ owner, keyAccount, bump })],
    [
      "writeKeyChunk-1",
      writeKeyChunkIx({ owner, keyAccount, bump, offset: 0, chunk: key.subarray(0, XWING_KEY_CHUNK_SIZE) }),
    ],
    [
      "writeKeyChunk-2",
      writeKeyChunkIx({ owner, keyAccount, bump, offset: XWING_KEY_CHUNK_SIZE, chunk: key.subarray(XWING_KEY_CHUNK_SIZE) }),
    ],
    ["finalizeKey", finalizeKeyIx({ owner, keyAccount, bump })],
  ];

  let lastSig = "";
  for (const [label, ix] of steps) {
    const tx = new Transaction().add(ix);
    lastSig = await sendTxWithConfirmation(conn, tx, params.from, label);
  }

  return { signature: lastSig };
}

export async function fetchRecipientXWingKey(
  conn: Connection,
  recipientAddress: string,
): Promise<Uint8Array | null> {
  const recipient = new PublicKey(recipientAddress);
  const key = await fetchXWingKeyAccount(conn, recipient);
  return key ? new Uint8Array(key) : null;
}

export async function getRegistrationStatus(params: {
  network: NetworkId;
  ownerAddress: string;
  rpcUrlOverride?: string | null;
}): Promise<{ registered: boolean }> {
  const conn = getConnection(params.network, params.rpcUrlOverride);
  const owner = new PublicKey(params.ownerAddress);
  const registered = await isXWingRegistered(conn, owner);
  return { registered };
}
