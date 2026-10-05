// Reads a landed transaction of any version (legacy, 0 or 1) and reports its version, fee payer and budget.
import {
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionMessageComputeUnitLimit,
  getTransactionMessageLoadedAccountsDataSizeLimit,
  getTransactionMessagePriorityFeeLamports,
} from "@solana/kit";
import type { Connection } from "@solana/web3.js";

// Version the wallet should land: 1 on Agave 4.x, 0 when the validator rejects v1 and the sender falls back.
export const EXPECTED_TX_VERSION = Number(process.env.BRUME_EXPECT_TX_VERSION ?? 1);

export type LandedTx = {
  version: "legacy" | number;
  feePayer: string;
  computeUnitLimit: number | undefined;
  loadedAccountsDataSizeLimit: number | undefined;
  priorityFeeLamports: bigint | undefined;
  unitsConsumed: number;
};

export async function landedTx(conn: Connection, signature: string): Promise<LandedTx> {
  const res = await fetch(conn.rpcEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [signature, { encoding: "base64", maxSupportedTransactionVersion: 1, commitment: "confirmed" }],
    }),
  });
  const body = (await res.json()) as { result?: { transaction: [string, string]; meta: { computeUnitsConsumed?: number } }; error?: { message: string } };
  if (!body.result) throw new Error(`getTransaction ${signature}: ${body.error?.message ?? "not found"}`);
  const tx = getTransactionDecoder().decode(Buffer.from(body.result.transaction[0], "base64"));
  const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  // Only v1 is decompiled: a v0 message with lookup tables cannot be decompiled without their contents.
  const message = compiled.version === 1 ? decompileTransactionMessage(compiled) : null;
  return {
    version: compiled.version,
    feePayer: compiled.staticAccounts[0],
    computeUnitLimit: message ? getTransactionMessageComputeUnitLimit(message) : undefined,
    loadedAccountsDataSizeLimit: message ? getTransactionMessageLoadedAccountsDataSizeLimit(message) : undefined,
    priorityFeeLamports: message ? getTransactionMessagePriorityFeeLamports(message as never) : undefined,
    unitsConsumed: body.result.meta.computeUnitsConsumed ?? 0,
  };
}
