// Adds ComputeBudget instructions (unit limit + unit price) to wallet-built transactions on
// mainnet. Policy and math live in @/shared/priority-fee; this file does the RPC work.
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import type { NetworkId } from "@/shared/constants";
import {
  BASE_FEE_LAMPORTS_PER_SIGNATURE,
  MAX_COMPUTE_UNITS,
  PRIORITY_LEVELS,
  TYPICAL_COMPUTE_UNITS,
  computeUnitLimitFor,
  normalizePriorityLevel,
  priorityFeeLamports,
  priorityPriceFor,
  type PriorityLevel,
} from "@/shared/priority-fee";

const MAX_LOCKED_ACCOUNTS = 128;

export function priorityFeesApply(network: NetworkId): boolean {
  return network === "mainnet-beta";
}

function isComputeBudgetIx(ix: TransactionInstruction): boolean {
  return ix.programId.equals(ComputeBudgetProgram.programId);
}

function writableAccounts(ixs: readonly TransactionInstruction[]): PublicKey[] {
  const seen = new Map<string, PublicKey>();
  for (const ix of ixs) {
    for (const k of ix.keys) {
      if (k.isWritable && !seen.has(k.pubkey.toBase58())) seen.set(k.pubkey.toBase58(), k.pubkey);
    }
  }
  return [...seen.values()].slice(0, MAX_LOCKED_ACCOUNTS);
}

async function recentFees(conn: Connection, accounts: PublicKey[]): Promise<number[]> {
  try {
    const rows = await conn.getRecentPrioritizationFees(
      accounts.length ? { lockedWritableAccounts: accounts } : undefined,
    );
    return rows.map((r) => r.prioritizationFee);
  } catch {
    return []; // RPC without this method: the level floor applies
  }
}

export async function estimatePriorityPrice(
  conn: Connection,
  level: PriorityLevel,
  ixs: readonly TransactionInstruction[] = [],
): Promise<number> {
  return priorityPriceFor(level, await recentFees(conn, writableAccounts(ixs)));
}

async function simulateUnits(
  conn: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  price: number,
): Promise<number | null> {
  try {
    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash: PublicKey.default.toBase58(),
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
        ...ixs,
      ],
    }).compileToV0Message();
    const sim = await conn.simulateTransaction(new VersionedTransaction(message), {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    });
    // A failing simulation is not an error here: the normal send preflight reports it with logs.
    if (sim.value.err) return null;
    return sim.value.unitsConsumed ?? null;
  } catch {
    return null;
  }
}

/**
 * Mainnet only: prepend setComputeUnitLimit (simulated usage + headroom) and
 * setComputeUnitPrice (recent fees on the written accounts, per the chosen level).
 * Call after all instructions are added and before signing. No-op on other networks
 * or when the transaction already sets its own compute budget.
 */
export async function applyPriorityFee(params: {
  conn: Connection;
  network: NetworkId;
  tx: Transaction;
  level?: PriorityLevel;
}): Promise<{ microLamportsPerCu: number; computeUnitLimit: number } | null> {
  const { conn, network, tx } = params;
  if (!priorityFeesApply(network)) return null;
  if (tx.instructions.some(isComputeBudgetIx)) return null;
  const payer = tx.feePayer;
  if (!payer) throw new Error("Transaction fee payer is not set");

  const level = normalizePriorityLevel(params.level);
  const ixs = [...tx.instructions];
  const price = await estimatePriorityPrice(conn, level, ixs);
  const units = await simulateUnits(conn, payer, ixs, price);
  const limit = computeUnitLimitFor(units, ixs.length);

  tx.instructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: limit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
    ...ixs,
  ];
  return { microLamportsPerCu: price, computeUnitLimit: limit };
}

export type PriorityFeeQuote = {
  level: PriorityLevel;
  microLamportsPerCu: number;
  /** Base fee + priority fee for a TYPICAL_COMPUTE_UNITS transaction with one signature. */
  typicalTotalLamports: number;
};

/** Network-wide estimate per level, for the Settings screen. */
export async function quotePriorityFees(conn: Connection): Promise<PriorityFeeQuote[]> {
  const fees = await recentFees(conn, []);
  return PRIORITY_LEVELS.map((level) => {
    const price = priorityPriceFor(level, fees);
    return {
      level,
      microLamportsPerCu: price,
      typicalTotalLamports:
        BASE_FEE_LAMPORTS_PER_SIGNATURE + priorityFeeLamports(price, TYPICAL_COMPUTE_UNITS),
    };
  });
}
