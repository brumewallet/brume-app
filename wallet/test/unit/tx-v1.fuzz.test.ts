// Fuzz of the v1 transaction builder: decode with the reference codec and check version, budget, instructions, signatures and size.
import fc from "fast-check";
import {
  AccountRole,
  decompileTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  getTransactionMessageComputeUnitLimit,
  getTransactionMessageLoadedAccountsDataSizeLimit,
  getTransactionMessagePriorityFeeLamports,
  type Instruction,
} from "@solana/kit";
import { ComputeBudgetProgram, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { V1_SIZE_LIMIT, buildV1Transaction } from "@/background/tx-v1";
import { encodeBase58 } from "@/shared/base58";
import { MAX_COMPUTE_UNITS, MAX_LOADED_ACCOUNTS_DATA_SIZE } from "@/shared/priority-fee";

const params: fc.Parameters<unknown> = {
  numRuns: Number(process.env.FUZZ_RUNS ?? 500),
  ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
};

const pool = Array.from({ length: 12 }, () => Keypair.generate().publicKey);
const programs = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
const BLOCKHASH = encodeBase58(Uint8Array.from({ length: 32 }, (_, i) => i + 1));

const ixArb = fc
  .record({
    program: fc.integer({ min: 0, max: programs.length - 1 }),
    accounts: fc.uniqueArray(fc.integer({ min: 0, max: pool.length - 1 }), { maxLength: 8 }),
    writable: fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
    data: fc.uint8Array({ maxLength: 400 }),
  })
  .map(({ program, accounts, writable, data }) =>
    new TransactionInstruction({
      programId: programs[program],
      keys: accounts.map((a, i) => ({ pubkey: pool[a], isSigner: false, isWritable: writable[i] })),
      data: Buffer.from(data),
    }),
  );

const configArb = fc.record({
  computeUnitLimit: fc.integer({ min: 1, max: MAX_COMPUTE_UNITS }),
  loadedAccountsDataSizeLimit: fc.integer({ min: 1, max: MAX_LOADED_ACCOUNTS_DATA_SIZE }),
  priorityFeeLamports: fc.option(fc.bigInt({ min: 1n, max: 10n ** 12n }), { nil: undefined }),
});

const roleOf = (r: AccountRole) => ({
  isSigner: r === AccountRole.READONLY_SIGNER || r === AccountRole.WRITABLE_SIGNER,
  isWritable: r === AccountRole.WRITABLE || r === AccountRole.WRITABLE_SIGNER,
});

describe("v1 transaction builder", () => {
  it("round-trips through the reference decoder with valid signatures", () => {
    fc.assert(
      fc.property(
        fc.array(ixArb, { minLength: 1, maxLength: 6 }),
        configArb,
        fc.integer({ min: 0, max: 2 }),
        fc.boolean(),
        (ixs, config, extraSigners, withBudgetIx) => {
          const payer = Keypair.generate();
          const cosigners = Array.from({ length: extraSigners }, () => Keypair.generate());
          // Co-signers ride on the first instruction, like a vault member signing an SDK payload.
          const first = ixs[0];
          ixs[0] = new TransactionInstruction({
            programId: first.programId,
            keys: [...cosigners.map((c) => ({ pubkey: c.publicKey, isSigner: true, isWritable: false })), ...first.keys],
            data: first.data,
          });
          // A ComputeBudget instruction must be dropped: v1 keeps the budget in the message.
          const input = withBudgetIx ? [ComputeBudgetProgram.setComputeUnitLimit({ units: 5 }), ...ixs] : ixs;

          let built: { bytes: Uint8Array; signature: string };
          try {
            built = buildV1Transaction({
              payer: payer.publicKey,
              signers: [payer, ...cosigners],
              ixs: input,
              blockhash: BLOCKHASH,
              lastValidBlockHeight: 1000,
              config,
            });
          } catch (e) {
            // The only acceptable failure is the size limit.
            expect(String(e)).toMatch(/over the 4096-byte limit/);
            return;
          }
          expect(built.bytes.length).toBeLessThanOrEqual(V1_SIZE_LIMIT);

          const tx = getTransactionDecoder().decode(built.bytes);
          const compiled = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
          expect(compiled.version).toBe(1);
          const message = decompileTransactionMessage(compiled);
          expect(getTransactionMessageComputeUnitLimit(message)).toBe(config.computeUnitLimit);
          expect(getTransactionMessageLoadedAccountsDataSizeLimit(message)).toBe(config.loadedAccountsDataSizeLimit);
          expect(getTransactionMessagePriorityFeeLamports(message as never)).toBe(config.priorityFeeLamports);
          expect(message.feePayer.address).toBe(payer.publicKey.toBase58());

          const decoded = message.instructions as readonly Instruction[];
          expect(decoded.length).toBe(ixs.length);
          decoded.forEach((d, i) => {
            expect(d.programAddress).toBe(ixs[i].programId.toBase58());
            expect(Buffer.from(d.data ?? new Uint8Array()).equals(Buffer.from(ixs[i].data))).toBe(true);
            const accounts = (d.accounts ?? []).map((a) => ({ pubkey: a.address, ...roleOf(a.role) }));
            const want = ixs[i].keys.map((k) => ({ pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable }));
            // The compiler may upgrade an account's role when it is a signer or writable elsewhere in the message.
            accounts.forEach((a, j) => {
              expect(a.pubkey).toBe(want[j].pubkey);
              if (want[j].isSigner) expect(a.isSigner).toBe(true);
              if (want[j].isWritable) expect(a.isWritable).toBe(true);
            });
          });

          for (const [addr, sig] of Object.entries(tx.signatures)) {
            expect(sig).not.toBeNull();
            expect(nacl.sign.detached.verify(Uint8Array.from(tx.messageBytes), Uint8Array.from(sig!), new PublicKey(addr).toBytes())).toBe(true);
          }
          expect(built.signature).toBe(encodeBase58(Uint8Array.from((tx.signatures as Record<string, Uint8Array | null>)[payer.publicKey.toBase58()]!)));
        },
      ),
      params,
    );
  });

  it("refuses to build when a required signer is missing", () => {
    const payer = Keypair.generate();
    const other = Keypair.generate();
    const ix = new TransactionInstruction({ programId: programs[0], keys: [{ pubkey: other.publicKey, isSigner: true, isWritable: false }], data: Buffer.alloc(0) });
    expect(() =>
      buildV1Transaction({ payer: payer.publicKey, signers: [payer], ixs: [ix], blockhash: BLOCKHASH, lastValidBlockHeight: 1, config: { computeUnitLimit: 1, loadedAccountsDataSizeLimit: 1 } }),
    ).toThrow(/Missing signer/);
  });
});
