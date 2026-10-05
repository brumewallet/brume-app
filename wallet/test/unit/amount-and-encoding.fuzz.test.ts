// Fuzz of amount parsing and u64 encoding for shield, unshield and send; reproduce with FC_SEED and FC_PATH.
import fc from "fast-check";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { parseTokenAmount } from "@/background/brume-vault";
import { humanAmountToTokenRaw } from "@/background/rpc";
import {
  createBurnCheckedInstruction,
  createTransferCheckedInstruction,
} from "@/shared/spl-token-inline";

const U64_MAX = 2n ** 64n - 1n;
const NUM_RUNS = Number(process.env.FUZZ_RUNS ?? 2_000);
const params: fc.Parameters<unknown> = {
  numRuns: NUM_RUNS,
  ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
  ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}),
};

const decimalsArb = fc.integer({ min: 0, max: 18 });
const rawArb = fc.bigInt({ min: 1n, max: U64_MAX });

// Canonical decimal string for a raw amount, plus cosmetic variants a user may type.
const formattedArb = fc
  .record({
    decimals: decimalsArb,
    raw: rawArb,
    leadingZeros: fc.integer({ min: 0, max: 3 }),
    trailingZeros: fc.integer({ min: 0, max: 3 }),
    thousands: fc.boolean(),
    pad: fc.constantFrom("", " ", "\t", "  \n"),
  })
  .map(({ decimals, raw, leadingZeros, trailingZeros, thousands, pad }) => {
    const scale = 10n ** BigInt(decimals);
    let whole = (raw / scale).toString();
    const frac = decimals > 0 ? (raw % scale).toString().padStart(decimals, "0") : "";
    if (thousands) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    whole = "0".repeat(leadingZeros) + whole;
    const fracPart = decimals > 0 ? frac + "0".repeat(trailingZeros) : "";
    const text = pad + whole + (fracPart ? "." + fracPart : "") + pad;
    return { decimals, raw, text };
  });

// Strings built from characters that commonly appear in pasted / mistyped amounts.
const nastyArb = fc.string({
  unit: fc.constantFrom(
    ..."0123456789..,,-+eExX_ \t\n".split(""),
    "١", "٢", "０", "１", " ", " ", "∞", "NaN", "Infinity", "0x", "1e9",
  ),
  maxLength: 24,
});

function outcome(f: () => bigint): { ok: true; v: bigint } | { ok: false } {
  try {
    return { ok: true, v: f() };
  } catch {
    return { ok: false };
  }
}

describe("parseTokenAmount (Brume vault input)", () => {
  it("round-trips every formatted u64 amount at every decimals", () => {
    fc.assert(
      fc.property(formattedArb, ({ decimals, raw, text }) => {
        expect(parseTokenAmount(text, decimals)).toBe(raw);
      }),
      params,
    );
  });

  it("agrees with the wallet's other parser (humanAmountToTokenRaw) on any input", () => {
    fc.assert(
      fc.property(fc.oneof(nastyArb, fc.string(), formattedArb.map((f) => f.text)), decimalsArb, (s, d) => {
        const a = outcome(() => parseTokenAmount(s, d));
        const b = outcome(() => humanAmountToTokenRaw(s, d));
        expect(a).toEqual(b);
      }),
      params,
    );
  });

  it("returns only positive values, and only for plain ASCII decimal input", () => {
    fc.assert(
      fc.property(fc.oneof(nastyArb, fc.string()), decimalsArb, (s, d) => {
        const r = outcome(() => parseTokenAmount(s, d));
        if (!r.ok) return;
        expect(r.v > 0n).toBe(true);
        expect(s.trim().replace(/,/g, "")).toMatch(/^\d*(\.\d+)?$/);
      }),
      params,
    );
  });

  it("never rounds up when the user types more fractional digits than the mint has", () => {
    fc.assert(
      fc.property(
        decimalsArb,
        fc.bigInt({ min: 0n, max: 10n ** 30n }),
        fc.integer({ min: 1, max: 6 }),
        (d, units, extra) => {
          // `units` is the amount in 10^-(d+extra); the parsed value must be floor(units / 10^extra).
          const total = d + extra;
          const s = units.toString().padStart(total + 1, "0");
          const text = `${s.slice(0, s.length - total)}.${s.slice(s.length - total)}`;
          const expected = units / 10n ** BigInt(extra);
          const r = outcome(() => parseTokenAmount(text, d));
          if (expected === 0n) expect(r.ok).toBe(false);
          else expect(r).toEqual({ ok: true, v: expected });
        },
      ),
      params,
    );
  });

  it("rejects signs, exponents, hex, and non-ASCII digits", () => {
    for (const s of ["-1", "+1", "1e3", "1E3", "0x10", "Infinity", "NaN", "١", "１", "1 000", "", ".", "1.", "..1", "1..2"]) {
      expect(() => parseTokenAmount(s, 6), JSON.stringify(s)).toThrow();
    }
  });
});

describe("u64 instruction encoders never encode a different amount than requested", () => {
  const a = Keypair.generate().publicKey;
  const b = Keypair.generate().publicKey;
  const outOfRange = fc.oneof(
    fc.bigInt({ min: U64_MAX + 1n, max: 2n ** 128n }),
    fc.bigInt({ min: -(2n ** 64n), max: -1n }),
  );

  const encoders: [string, (v: bigint) => Uint8Array][] = [
    ["spl-token-inline transferChecked", (v) => createTransferCheckedInstruction(a, b, a, b, v, 6, b).data.subarray(1, 9)],
    ["spl-token-inline burnChecked", (v) => createBurnCheckedInstruction(a, b, a, v, 6, b).data.subarray(1, 9)],
    ["web3 SystemProgram.transfer", (v) => SystemProgram.transfer({ fromPubkey: a, toPubkey: b, lamports: v }).data.subarray(4, 12)],
  ];

  for (const [name, encode] of encoders) {
    it(`${name}: exact little-endian encoding for every u64`, () => {
      fc.assert(
        fc.property(fc.bigInt({ min: 0n, max: U64_MAX }), (v) => {
          expect(Buffer.from(encode(v)).readBigUInt64LE(0)).toBe(v);
        }),
        params,
      );
    });

    it(`${name}: throws for amounts outside u64 (no silent wrap)`, () => {
      fc.assert(
        fc.property(outOfRange, (v) => {
          expect(() => encode(v)).toThrow();
        }),
        params,
      );
    });
  }
});
