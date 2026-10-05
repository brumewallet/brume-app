// Pre-send SOL check: simulates a transaction and stops it when the fee payer runs out of SOL.
import { Transaction, VersionedTransaction, type Connection, type PublicKey } from "@solana/web3.js";
import { lamportsToSol, parseInsufficientLamports } from "@/shared/errors";

// Throws with the full amount `payer` must add; rent and fees change with the network, so the simulation measures them.
export async function assertEnoughSol(
  conn: Connection,
  payer: PublicKey,
  tx: Transaction | VersionedTransaction,
  payerName = "Your wallet",
): Promise<void> {
  let short: bigint;
  try {
    const probe = tx instanceof VersionedTransaction ? tx : new VersionedTransaction(tx.compileMessage());
    const sim = await conn.simulateTransaction(probe, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    if (!sim.value.err) return;
    const parsed = parseInsufficientLamports((sim.value.logs ?? []).join("\n"));
    // Other failures go to the normal send preflight, which reports them with logs.
    if (!parsed || parsed.need <= parsed.have) return;
    short = parsed.need - parsed.have;
  } catch {
    return;
  }
  const balance = BigInt(await conn.getBalance(payer, "confirmed"));
  throw new Error(
    `Not enough SOL. This transaction needs at least ${lamportsToSol(balance + short)} SOL, ` +
      `including network fees and rent for any new accounts. ${payerName} has ${lamportsToSol(balance)} SOL. ` +
      `Add at least ${lamportsToSol(short)} SOL or use a smaller amount.`,
  );
}
