// Guards the pnpm patch on the SDK V2 sync compiler: every inner instruction must resolve to its own program and accounts.
import fc from "fast-check";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { codecs } from "@loyal-labs/loyal-smart-accounts";
import { describe, expect, it } from "vitest";

type Decoded = { programIdIndex: number; accountIndexes: number[]; data: Uint8Array };

function decode(buf: Uint8Array): Decoded[] {
  const out: Decoded[] = [];
  let o = 1;
  for (let i = 0; i < buf[0]; i++) {
    const programIdIndex = buf[o++];
    const n = buf[o++];
    const accountIndexes = [...buf.subarray(o, o + n)];
    o += n;
    const len = buf[o] | (buf[o + 1] << 8);
    o += 2;
    out.push({ programIdIndex, accountIndexes, data: buf.subarray(o, o + len) });
    o += len;
  }
  return out;
}

const pool = Array.from({ length: 10 }, () => Keypair.generate().publicKey);
const programs = Array.from({ length: 4 }, () => Keypair.generate().publicKey);

const ixArb = fc
  .record({
    program: fc.integer({ min: 0, max: programs.length - 1 }),
    accounts: fc.uniqueArray(fc.integer({ min: 0, max: pool.length - 1 }), { minLength: 1, maxLength: 6 }),
    writable: fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }),
    data: fc.uint8Array({ maxLength: 16 }),
  })
  .map(({ program, accounts, writable, data }) =>
    new TransactionInstruction({
      programId: programs[program],
      keys: accounts.map((a, i) => ({ pubkey: pool[a], isSigner: false, isWritable: writable[i] })),
      data: Buffer.from(data),
    }),
  );

describe("V2 sync payload compiler (patched SDK)", () => {
  it("multi-instruction payloads keep correct program and account indexes", () => {
    fc.assert(
      fc.property(fc.array(ixArb, { minLength: 1, maxLength: 6 }), (ixs) => {
        const vault = pool[0];
        const member = Keypair.generate().publicKey;
        // Real payloads always carry the vault as the writable signer (it is the CPI authority).
        ixs[0] = new TransactionInstruction({
          programId: ixs[0].programId,
          keys: [{ pubkey: vault, isSigner: true, isWritable: true }, ...ixs[0].keys.filter((k) => !k.pubkey.equals(vault))],
          data: ixs[0].data,
        });
        const { instructions, accounts } = codecs.instructionsToSynchronousTransactionDetailsV2({
          vaultPda: vault,
          members: [member],
          transaction_instructions: ixs,
        });
        // Exactly one signer member at the front; indexes count from the first account after it.
        expect(accounts.filter((a) => a.pubkey.equals(member)).length).toBe(1);
        expect(accounts[0].pubkey.equals(member)).toBe(true);
        const at = (i: number): PublicKey => accounts[1 + i].pubkey;
        const decoded = decode(instructions);
        expect(decoded.length).toBe(ixs.length);
        decoded.forEach((d, i) => {
          expect(at(d.programIdIndex).toBase58()).toBe(ixs[i].programId.toBase58());
          expect(d.accountIndexes.map((x) => at(x).toBase58())).toEqual(ixs[i].keys.map((k) => k.pubkey.toBase58()));
          expect(Buffer.from(d.data).equals(Buffer.from(ixs[i].data))).toBe(true);
        });
      }),
      { numRuns: Number(process.env.FUZZ_RUNS ?? 500) },
    );
  });
});
