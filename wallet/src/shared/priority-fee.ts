// Priority-fee policy for wallet-built transactions (never dApp transactions); pure, shared by popup, background and tests.

export type PriorityLevel = "normal" | "fast" | "turbo";

export const PRIORITY_LEVELS: readonly PriorityLevel[] = ["normal", "fast", "turbo"];

export const DEFAULT_PRIORITY_LEVEL: PriorityLevel = "normal";

export const PRIORITY_LEVEL_LABEL: Record<PriorityLevel, string> = {
  normal: "Normal",
  fast: "Fast",
  turbo: "Turbo",
};

// Price (micro-lamports per CU) = percentile of recent fees on the written accounts, clamped to [floor, MAX_PRICE].
export const PRIORITY_POLICY: Record<PriorityLevel, { percentile: number; floor: number }> = {
  normal: { percentile: 50, floor: 1_000 },
  fast: { percentile: 75, floor: 10_000 },
  turbo: { percentile: 95, floor: 100_000 },
};

// Hard cap of 2 lamports per CU: at most 0.0028 SOL priority cost per transaction.
export const MAX_PRICE_MICRO_LAMPORTS = 2_000_000;

export const MAX_COMPUTE_UNITS = 1_400_000;

// Limit used when simulation cannot measure the transaction.
export const FALLBACK_UNITS_PER_INSTRUCTION = 200_000;

// Typical wallet transaction limit for UI estimates (the heaviest measured on the mainnet fork used ~54k CU).
export const TYPICAL_COMPUTE_UNITS = 60_000;

export const BASE_FEE_LAMPORTS_PER_SIGNATURE = 5_000;

export function isPriorityLevel(v: unknown): v is PriorityLevel {
  return typeof v === "string" && (PRIORITY_LEVELS as readonly string[]).includes(v);
}

export function normalizePriorityLevel(v: unknown): PriorityLevel {
  return isPriorityLevel(v) ? v : DEFAULT_PRIORITY_LEVEL;
}

// Nearest-rank percentile; 0 for no samples.
export function percentile(samples: readonly number[], p: number): number {
  const clean = samples.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  const rank = Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * clean.length);
  return clean[Math.min(Math.max(rank - 1, 0), clean.length - 1)];
}

// Micro-lamports per CU for a level, from recent per-slot prioritization fees.
export function priorityPriceFor(level: PriorityLevel, recentFees: readonly number[]): number {
  const { percentile: p, floor } = PRIORITY_POLICY[level];
  const observed = Math.ceil(percentile(recentFees, p));
  return Math.min(Math.max(observed, floor), MAX_PRICE_MICRO_LAMPORTS);
}

// Compute-unit limit from simulated use: +15% and +2,000 CU headroom, capped.
export function computeUnitLimitFor(
  unitsConsumed: number | null | undefined,
  instructionCount: number,
): number {
  if (unitsConsumed == null || !Number.isFinite(unitsConsumed) || unitsConsumed <= 0) {
    return Math.min(
      Math.max(instructionCount, 1) * FALLBACK_UNITS_PER_INSTRUCTION,
      MAX_COMPUTE_UNITS,
    );
  }
  return Math.min(Math.ceil(unitsConsumed * 1.15) + 2_000, MAX_COMPUTE_UNITS);
}

// Lamports a transaction pays for priority: ceil(price * limit / 1e6).
export function priorityFeeLamports(microLamportsPerCu: number, computeUnitLimit: number): number {
  return Math.ceil((microLamportsPerCu * computeUnitLimit) / 1_000_000);
}
