
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  buildRegistrationTxs,
  deriveRegistry,
  REGISTRY_PROGRAM_ID,
  XWING_PUBLIC_KEY_SIZE,
} from "@brume/sdk";
import type { NetworkId } from "@/shared/constants";
import { getConnection } from "./rpc";
import { detailedTransactionFailureMessage } from "@/shared/errors";
import { serializeUnknownForLog } from "@/shared/errors";

const OFF_IS_FINALIZED = 9;
const REGISTRY_ACCOUNT_MIN_SIZE = 10;

async function sendTxWithConfirmation(
  conn: Connection,
  tx: import("@solana/web3.js").Transaction,
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
  const [registry] = deriveRegistry(owner);
  const info = await conn.getAccountInfo(registry, "confirmed");
  if (!info || !info.owner.equals(REGISTRY_PROGRAM_ID)) return false;
  if (info.data.length < REGISTRY_ACCOUNT_MIN_SIZE) return false;
  return info.data[OFF_IS_FINALIZED] === 1;
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
  const [registry, registryBump] = deriveRegistry(owner);

  const txs = buildRegistrationTxs({
    owner,
    registry,
    registryBump,
    xwingPublicKey: params.xwingPublicKey,
  });

  let lastSig = "";
  const labels = ["initializeRegistry", "uploadKeyChunk-1", "uploadKeyChunk-2", "finalizeRegistry"];
  for (let i = 0; i < txs.length; i++) {
    lastSig = await sendTxWithConfirmation(
      conn,
      txs[i]!,
      params.from,
      labels[i] ?? `tx-${i}`,
    );
  }

  return { signature: lastSig };
}

export async function fetchRecipientXWingKey(
  conn: Connection,
  recipientAddress: string,
): Promise<Uint8Array | null> {
  const recipient = new PublicKey(recipientAddress);
  const [registry] = deriveRegistry(recipient);
  const info = await conn.getAccountInfo(registry, "confirmed");
  if (!info || !info.owner.equals(REGISTRY_PROGRAM_ID)) return null;

  const data = info.data;
  if (data.length < REGISTRY_ACCOUNT_MIN_SIZE) return null;
  if (data[OFF_IS_FINALIZED] !== 1) return null;

  const KEY_OFFSET = 42;
  if (data.length < KEY_OFFSET + XWING_PUBLIC_KEY_SIZE) return null;

  return new Uint8Array(data.slice(KEY_OFFSET, KEY_OFFSET + XWING_PUBLIC_KEY_SIZE));
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
