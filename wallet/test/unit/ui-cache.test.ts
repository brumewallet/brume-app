// Balance / portfolio / shielded-balance cache is encrypted at rest and only readable while unlocked.
import { Keypair } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeLocalArea() {
  const data: Record<string, unknown> = {};
  return {
    data,
    area: {
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(data, structuredClone(items));
      }),
      get: vi.fn(async (key: string | null) => {
        if (key === null) return structuredClone(data);
        return key in data ? { [key]: structuredClone(data[key]) } : {};
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
      }),
    },
  };
}

let fake: ReturnType<typeof fakeLocalArea>;

beforeEach(() => {
  vi.resetModules();
  fake = fakeLocalArea();
  vi.stubGlobal("chrome", { storage: { local: fake.area } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadUnlocked(kp: Keypair) {
  const mod = await import("@/background/ui-cache");
  let unlocked = true;
  mod.setUiCacheSecretKeyLookup((addr) =>
    unlocked && addr === kp.publicKey.toBase58() ? kp.secretKey : null,
  );
  return { mod, lock: () => (unlocked = false) };
}

describe("ui-cache", () => {
  it("round-trips balance, portfolio and shielded balances without storing plaintext", async () => {
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    const { mod } = await loadUnlocked(kp);

    await mod.writeBalanceCache("mainnet-beta", addr, "123456789");
    await mod.writeShieldBalancesCache("mainnet-beta", addr, { MintAbc: "42000" });
    await mod.writePortfolioCache("mainnet-beta", addr, [
      { mint: "MintAbc", amountRaw: "987654321" } as never,
    ]);

    const disk = JSON.stringify(fake.data);
    expect(disk).not.toContain("123456789");
    expect(disk).not.toContain("42000");
    expect(disk).not.toContain("987654321");

    expect(await mod.readBalanceCache("mainnet-beta", addr)).toBe("123456789");
    expect((await mod.readShieldBalancesCacheEntry("mainnet-beta", addr))?.balances).toEqual({
      MintAbc: "42000",
    });
    expect((await mod.readPortfolioCache("mainnet-beta", addr))?.[0]?.amountRaw).toBe("987654321");
  });

  it("cannot read or write while locked", async () => {
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    const { mod, lock } = await loadUnlocked(kp);
    await mod.writeBalanceCache("mainnet-beta", addr, "5");
    lock();
    expect(await mod.readBalanceCache("mainnet-beta", addr)).toBeNull();
    await mod.writeBalanceCache("devnet", addr, "6");
    expect(Object.keys(fake.data).some((k) => k.includes("devnet"))).toBe(false);
  });

  it("rejects a row moved to another account's key", async () => {
    const a = Keypair.generate();
    const b = Keypair.generate();
    const mod = await import("@/background/ui-cache");
    mod.setUiCacheSecretKeyLookup((addr) =>
      addr === a.publicKey.toBase58() ? a.secretKey : addr === b.publicKey.toBase58() ? b.secretKey : null,
    );
    await mod.writeBalanceCache("mainnet-beta", a.publicKey.toBase58(), "777");
    const [aKey] = Object.keys(fake.data);
    const bKey = aKey!.replace(a.publicKey.toBase58(), b.publicKey.toBase58());
    fake.data[bKey] = fake.data[aKey!];

    expect(await mod.readBalanceCache("mainnet-beta", b.publicKey.toBase58())).toBeNull();
    expect(fake.data[bKey]).toBeUndefined();
  });

  it("purges legacy plaintext rows and keeps current ones", async () => {
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    const { mod } = await loadUnlocked(kp);
    fake.data[`brume_cache_balance_v1:mainnet-beta:${addr}`] = { balanceSolBaseUnits: "1", t: 1 };
    fake.data.brume_wallet_v1 = { version: 2 };
    await mod.writeBalanceCache("mainnet-beta", addr, "2");

    await mod.purgeLegacyUiCache();

    expect(fake.data[`brume_cache_balance_v1:mainnet-beta:${addr}`]).toBeUndefined();
    expect(fake.data.brume_wallet_v1).toBeDefined();
    expect(await mod.readBalanceCache("mainnet-beta", addr)).toBe("2");

    await mod.clearUiCache();
    expect(Object.keys(fake.data)).toEqual(["brume_wallet_v1"]);
  });
});
