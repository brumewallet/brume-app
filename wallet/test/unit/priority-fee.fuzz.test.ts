// Property-based fuzz for the priority-fee policy (pure; no network).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MAX_COMPUTE_UNITS,
  MAX_PRICE_MICRO_LAMPORTS,
  PRIORITY_LEVELS,
  PRIORITY_POLICY,
  computeUnitLimitFor,
  normalizePriorityLevel,
  percentile,
  priorityFeeLamports,
  priorityPriceFor,
} from "@/shared/priority-fee";

const params: fc.Parameters<unknown> = {
  numRuns: Number(process.env.FUZZ_RUNS ?? 2_000),
  ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};

// Recent per-slot fees as RPCs return them: mostly zeros, sometimes huge spikes.
const feesArb = fc.array(
  fc.oneof(
    { weight: 4, arbitrary: fc.constant(0) },
    { weight: 4, arbitrary: fc.integer({ min: 1, max: 50_000 }) },
    { weight: 1, arbitrary: fc.integer({ min: 50_000, max: 1_000_000_000 }) },
  ),
  { maxLength: 150 },
);
const levelArb = fc.constantFrom(...PRIORITY_LEVELS);

describe("priority fee policy", () => {
  it("percentile returns a sample (or 0) and never decreases as p grows", () => {
    fc.assert(
      fc.property(feesArb, fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (fees, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const x = percentile(fees, lo);
        expect(fees.length === 0 ? x === 0 : fees.includes(x)).toBe(true);
        expect(percentile(fees, hi)).toBeGreaterThanOrEqual(x);
      }),
      params,
    );
  });

  it("price is an integer within [level floor, hard cap] for any fee history", () => {
    fc.assert(
      fc.property(feesArb, levelArb, (fees, level) => {
        const price = priorityPriceFor(level, fees);
        expect(Number.isInteger(price)).toBe(true);
        expect(price).toBeGreaterThanOrEqual(PRIORITY_POLICY[level].floor);
        expect(price).toBeLessThanOrEqual(MAX_PRICE_MICRO_LAMPORTS);
      }),
      params,
    );
  });

  it("levels never invert: normal <= fast <= turbo on the same history", () => {
    fc.assert(
      fc.property(feesArb, (fees) => {
        const [n, f, t] = PRIORITY_LEVELS.map((l) => priorityPriceFor(l, fees));
        expect(n).toBeLessThanOrEqual(f);
        expect(f).toBeLessThanOrEqual(t);
      }),
      params,
    );
  });

  it("compute limit always covers measured usage and never exceeds the protocol max", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 1, max: MAX_COMPUTE_UNITS }), { nil: null }),
        fc.integer({ min: 0, max: 64 }),
        (units, ixCount) => {
          const limit = computeUnitLimitFor(units, ixCount);
          expect(Number.isInteger(limit)).toBe(true);
          expect(limit).toBeGreaterThan(0);
          expect(limit).toBeLessThanOrEqual(MAX_COMPUTE_UNITS);
          if (units != null && units <= MAX_COMPUTE_UNITS / 1.2) expect(limit).toBeGreaterThan(units);
        },
      ),
      params,
    );
  });

  it("worst-case priority cost is bounded (cap price x max units)", () => {
    fc.assert(
      fc.property(feesArb, levelArb, fc.integer({ min: 1, max: MAX_COMPUTE_UNITS }), (fees, level, units) => {
        const fee = priorityFeeLamports(priorityPriceFor(level, fees), computeUnitLimitFor(units, 1));
        expect(fee).toBeLessThanOrEqual(priorityFeeLamports(MAX_PRICE_MICRO_LAMPORTS, MAX_COMPUTE_UNITS));
        expect(priorityFeeLamports(MAX_PRICE_MICRO_LAMPORTS, MAX_COMPUTE_UNITS)).toBe(2_800_000); // 0.0028 SOL
      }),
      params,
    );
  });

  it("unknown stored levels fall back to the default", () => {
    fc.assert(
      fc.property(fc.anything(), (v) => {
        expect(PRIORITY_LEVELS).toContain(normalizePriorityLevel(v));
      }),
      params,
    );
  });
});
