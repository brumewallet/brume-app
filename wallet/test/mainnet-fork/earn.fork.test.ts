// Brume Earn against real mainnet Kamino state on the fork: deposit, reuse of the policy, and the position read path.
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  transferChecked,
} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { policies } from "@loyal-labs/loyal-smart-accounts";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { automationKeypair, earnDeposit, fetchEarnPosition, readEarnRecord } from "@/background/earn";
import { installKaminoApiShim } from "./kamino-shim";

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
const usdc = (n: number) => BigInt(Math.round(n * 1e6));
let conn: Connection;
let owner: Keypair;

async function airdrop(to: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

describe("Brume Earn on a mainnet-beta fork", () => {
  beforeAll(async () => {
    conn = new Connection(inject("forkRpc"), "confirmed");
    owner = Keypair.generate();
    const whale = Keypair.fromSecretKey(Uint8Array.from(inject("whaleSecretKey")));
    await Promise.all([airdrop(owner.publicKey, 5), airdrop(whale.publicKey, 2)]);
    const mint = new PublicKey(inject("usdcMint"));
    const ownerAta = await getOrCreateAssociatedTokenAccount(conn, owner, mint, owner.publicKey, false, "confirmed");
    const whaleAta = getAssociatedTokenAddressSync(mint, whale.publicKey);
    await transferChecked(conn, whale, whaleAta, mint, ownerAta.address, whale, usdc(1_000), 6, [], { commitment: "confirmed" });

    installKaminoApiShim(conn);
  });

  it("first deposit creates the Smart Account, the Kamino obligation and the Earn policy", async () => {
    const { signatures } = await earnDeposit({ conn, network: NETWORK, from: owner, amountRaw: usdc(250) });
    expect(signatures.length).toBeGreaterThanOrEqual(1);

    const pos = await fetchEarnPosition({ conn, network: NETWORK, owner: owner.publicKey });
    expect(BigInt(pos.walletUsdcRaw)).toBe(usdc(750));
    // Kamino rounds collateral down, so the redeemable value can be a few base units under the deposit.
    expect(Number(BigInt(pos.suppliedRaw) - usdc(250))).toBeGreaterThanOrEqual(-5);
    expect(Number(BigInt(pos.suppliedRaw) - usdc(250))).toBeLessThanOrEqual(0);
    // Kamino rounding can leave a few base units idle in the vault.
    expect(BigInt(pos.idleRaw) <= 5n).toBe(true);

    const rec = await readEarnRecord(NETWORK, owner.publicKey);
    expect(rec?.policy).toBeDefined();
    const policy = await policies.queries.fetchPolicy(conn, new PublicKey(rec!.policy!.account));
    expect(policy.signers.map((s: { key: PublicKey }) => s.key.toBase58())).toEqual([automationKeypair(rec!).publicKey.toBase58()]);
  });

  it("second deposit reuses the policy and adds to the same obligation", async () => {
    const before = await fetchEarnPosition({ conn, network: NETWORK, owner: owner.publicKey });
    const policyBefore = (await readEarnRecord(NETWORK, owner.publicKey))?.policy?.account;
    await earnDeposit({ conn, network: NETWORK, from: owner, amountRaw: usdc(100) });
    const after = await fetchEarnPosition({ conn, network: NETWORK, owner: owner.publicKey });
    expect(BigInt(after.walletUsdcRaw)).toBe(usdc(650));
    const added = BigInt(after.suppliedRaw) - BigInt(before.suppliedRaw);
    expect(Number(added - usdc(100))).toBeGreaterThanOrEqual(-5);
    expect(Number(added - usdc(100))).toBeLessThanOrEqual(1);
    expect((await readEarnRecord(NETWORK, owner.publicKey))?.policy?.account).toBe(policyBefore);
  });
});
