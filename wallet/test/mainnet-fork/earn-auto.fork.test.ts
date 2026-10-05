// Brume auto-earn on the mainnet fork: enable, sweeps within the per-period cap, period rollover, automation key limits, disable.
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  transferChecked,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { PROGRAM_ID, codecs, generated } from "@loyal-labs/loyal-smart-accounts";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { automationKeypair, earnDeposit, earnVaultPda, fetchEarnPosition, readEarnRecord } from "@/background/earn";
import { disableAutoEarn, enableAutoEarn, remainingAllowance, runAutoEarnSweep } from "@/background/earn-auto";
import { resolveBrumeSettings } from "@/background/brume-vault";
import { sendV0 } from "@/background/tx-send";
import { installKaminoApiShim } from "./kamino-shim";
import { EXPECTED_TX_VERSION, landedTx } from "./landed-tx";

const storage: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (k: string) => ({ [k]: structuredClone(storage[k]) }),
      set: async (o: Record<string, unknown>) => Object.assign(storage, structuredClone(o)),
    },
  },
};

const NETWORK = "mainnet-beta" as const;
const PERIOD_SECONDS = 20n;
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
const SUPPLY_TOLERANCE = 5n;

let conn: Connection;
let owner: Keypair;
let mint: PublicKey;

async function airdrop(to: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

async function position() {
  return fetchEarnPosition({ conn, network: NETWORK, owner: owner.publicKey });
}

// Every auto-earn transaction must be version 1 with a sufficient compute limit and a priority fee (the fork runs as mainnet).
async function expectV1(signature: string, feePayer: string) {
  const tx = await landedTx(conn, signature);
  expect(tx.version).toBe(EXPECTED_TX_VERSION);
  expect(tx.feePayer).toBe(feePayer);
  if (EXPECTED_TX_VERSION !== 1) return;
  expect(tx.computeUnitLimit! >= tx.unitsConsumed).toBe(true);
  expect(tx.loadedAccountsDataSizeLimit! > 0).toBe(true);
  expect(tx.priorityFeeLamports! > 0n).toBe(true);
}

describe("Brume auto-earn on a mainnet-beta fork", () => {
  beforeAll(async () => {
    conn = new Connection(inject("forkRpc"), "confirmed");
    owner = Keypair.generate();
    const whale = Keypair.fromSecretKey(Uint8Array.from(inject("whaleSecretKey")));
    await Promise.all([airdrop(owner.publicKey, 5), airdrop(whale.publicKey, 2)]);
    mint = new PublicKey(inject("usdcMint"));
    const ownerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey, false, "confirmed");
    const whaleAta = getAssociatedTokenAddressSync(mint, whale.publicKey);
    await transferChecked(conn, whale, whaleAta, mint, ownerAta.address, whale, usdc(1_000), 6, [], { commitment: "confirmed" });
    installKaminoApiShim(conn);
  });

  it("enable sets up the delegation, the autodeposit policy and the automation key's SOL float", async () => {
    await earnDeposit({ conn, network: NETWORK, from: owner, amountRaw: usdc(10) });
    await enableAutoEarn({
      conn,
      network: NETWORK,
      from: owner,
      settings: { floorRaw: usdc(200), perPeriodCapRaw: usdc(300), periodSeconds: PERIOD_SECONDS },
    });
    const rec = await readEarnRecord(NETWORK, owner.publicKey);
    expect(rec?.autodeposit?.enabled).toBe(true);
    expect(rec?.autodepositSetup).toBeUndefined();
    const delegation = await conn.getAccountInfo(new PublicKey(rec!.autodeposit!.recurringDelegation), "confirmed");
    expect(delegation?.owner.toBase58()).toBe("De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44");
    expect(await remainingAllowance(conn, new PublicKey(rec!.autodeposit!.recurringDelegation))).toBe(usdc(300));
    expect(await conn.getBalance(automationKeypair(rec!).publicKey, "confirmed")).toBeGreaterThan(0);
  });

  it("a sweep pulls the surplus up to the cap and supplies it to Kamino, signed only by the automation key", async () => {
    const before = await position();
    expect(BigInt(before.walletUsdcRaw)).toBe(usdc(990));
    const res = await runAutoEarnSweep({ conn, network: NETWORK, owner: owner.publicKey });
    expect(res.skipped).toBeUndefined();
    expect(BigInt(res.pulledRaw)).toBe(usdc(300));
    // The sweep supplies all idle USDC, including rounding dust left by the first deposit.
    expect(BigInt(res.suppliedRaw) >= usdc(300) && BigInt(res.suppliedRaw) <= usdc(300) + SUPPLY_TOLERANCE).toBe(true);
    const automation = automationKeypair((await readEarnRecord(NETWORK, owner.publicKey))!).publicKey.toBase58();
    for (const sig of res.signatures) await expectV1(sig, automation);

    const after = await position();
    expect(BigInt(after.walletUsdcRaw)).toBe(usdc(690));
    // Kamino rounding can leave a few base units idle.
    expect(BigInt(after.idleRaw) <= SUPPLY_TOLERANCE).toBe(true);
    const added = BigInt(after.suppliedRaw) - BigInt(before.suppliedRaw);
    expect(added <= usdc(300) + SUPPLY_TOLERANCE && added >= usdc(300) - SUPPLY_TOLERANCE).toBe(true);
  });

  it("within the same period the cap stops further pulls", async () => {
    const res = await runAutoEarnSweep({ conn, network: NETWORK, owner: owner.publicKey });
    expect(BigInt(res.pulledRaw)).toBe(0n);
    expect(BigInt((await position()).walletUsdcRaw)).toBe(usdc(690));
  });

  it("after the period rolls over, the allowance is available again", async () => {
    await new Promise((r) => setTimeout(r, Number(PERIOD_SECONDS + 5n) * 1000));
    const res = await runAutoEarnSweep({ conn, network: NETWORK, owner: owner.publicKey });
    expect(BigInt(res.pulledRaw)).toBe(usdc(300));
    expect(BigInt((await position()).walletUsdcRaw)).toBe(usdc(390));
  });

  it("the automation key cannot move vault funds anywhere except into Kamino", async () => {
    const rec = (await readEarnRecord(NETWORK, owner.publicKey))!;
    const automation = automationKeypair(rec);
    const settings = (await resolveBrumeSettings({ conn, network: NETWORK, owner: owner.publicKey }))!;
    const vault = earnVaultPda(settings);
    // Give the vault some idle USDC to try to steal.
    const vaultAta = getAssociatedTokenAddressSync(mint, vault, true);
    await transferChecked(conn, owner, getAssociatedTokenAddressSync(mint, owner.publicKey), mint, vaultAta, owner, usdc(5), 6, [], { commitment: "confirmed" });
    const thiefAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, automation.publicKey, false, "confirmed");
    const vaultBefore = BigInt((await conn.getTokenAccountBalance(vaultAta, "confirmed")).value.amount);

    const steal = createTransferCheckedInstruction(vaultAta, mint, thiefAta.address, vault, usdc(5), 6);
    steal.keys = steal.keys.map((k) => (k.pubkey.equals(vault) ? { ...k, isWritable: true } : k));
    const compiled = codecs.instructionsToSynchronousTransactionDetailsV2({ vaultPda: vault, members: [automation.publicKey], transaction_instructions: [steal] });
    const viaPolicy = (policy: string, constraint: number) =>
      generated.createExecuteTransactionSyncV2Instruction(
        { consensusAccount: new PublicKey(policy), program: PROGRAM_ID, anchorRemainingAccounts: compiled.accounts },
        {
          args: {
            accountIndex: 1,
            numSigners: 1,
            payload: {
              __kind: "Policy",
              fields: [{
                __kind: "ProgramInteraction",
                fields: [{
                  instructionConstraintIndices: Uint8Array.from([constraint]),
                  transactionPayload: { __kind: "SyncTransaction", fields: [{ accountIndex: 1, instructions: compiled.instructions }] },
                }],
              }],
            },
          },
        },
        PROGRAM_ID,
      ) as TransactionInstruction;
    const asRoot = generated.createExecuteTransactionSyncV2Instruction(
      { consensusAccount: settings, program: PROGRAM_ID, anchorRemainingAccounts: compiled.accounts },
      { args: { accountIndex: 1, numSigners: 1, payload: { __kind: "Transaction", fields: [compiled.instructions] } } },
      PROGRAM_ID,
    ) as TransactionInstruction;

    for (const [label, ix] of [
      ["Earn policy, deposit constraint", viaPolicy(rec.policy!.account, 1)],
      ["Earn policy, withdraw constraint", viaPolicy(rec.policy!.account, 0)],
      ["autodeposit policy", viaPolicy(rec.autodeposit!.policy, 0)],
      ["root settings", asRoot],
    ] as const) {
      await expect(
        sendV0({ conn, network: NETWORK, signers: [automation], ixs: [ix], label: `steal via ${label}` }),
        label,
      ).rejects.toThrow();
    }
    expect(BigInt((await conn.getTokenAccountBalance(vaultAta, "confirmed")).value.amount)).toBe(vaultBefore);
    expect(BigInt((await conn.getTokenAccountBalance(thiefAta.address, "confirmed")).value.amount)).toBe(0n);
  });

  it("disable revokes the delegation, so later sweeps do nothing", async () => {
    const rec = (await readEarnRecord(NETWORK, owner.publicKey))!;
    const delegation = new PublicKey(rec.autodeposit!.recurringDelegation);
    await disableAutoEarn({ conn, network: NETWORK, from: owner });
    expect((await readEarnRecord(NETWORK, owner.publicKey))?.autodeposit).toBeUndefined();
    expect(await remainingAllowance(conn, delegation)).toBe(0n);
    const res = await runAutoEarnSweep({ conn, network: NETWORK, owner: owner.publicKey });
    expect(res.skipped).toBe("auto-earn is off");
  });
});
