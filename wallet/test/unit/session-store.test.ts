// Unlocked session survives an MV3 worker restart through chrome.storage.session.
import { Keypair } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeSessionArea() {
  const data: Record<string, unknown> = {};
  return {
    data,
    area: {
      setAccessLevel: vi.fn(async () => {}),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(data, structuredClone(items));
      }),
      get: vi.fn(async (key: string) => (key in data ? { [key]: structuredClone(data[key]) } : {})),
      remove: vi.fn(async (key: string) => {
        delete data[key];
      }),
    },
  };
}

let fake: ReturnType<typeof fakeSessionArea>;

beforeEach(() => {
  vi.resetModules();
  fake = fakeSessionArea();
  vi.stubGlobal("chrome", { storage: { session: fake.area } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session-store", () => {
  it("restores every unlocked keypair, the active account, and the password", async () => {
    const { saveSession, loadSession } = await import("@/background/session-store");
    const a = Keypair.generate();
    const b = Keypair.generate();
    await saveSession({
      accountId: "acc-b",
      password: "hunter22",
      keypairs: new Map([
        ["acc-a", a],
        ["acc-b", b],
      ]),
    });

    // A restarted worker has fresh module state.
    vi.resetModules();
    const { loadSession: loadAfterRestart } = await import("@/background/session-store");
    const s = await loadAfterRestart();

    expect(s?.accountId).toBe("acc-b");
    expect(s?.password).toBe("hunter22");
    expect(s?.keypairs.get("acc-a")?.secretKey).toEqual(a.secretKey);
    expect(s?.keypairs.get("acc-b")?.publicKey.toBase58()).toBe(b.publicKey.toBase58());
    expect(loadSession).toBeTypeOf("function");
  });

  it("keeps the session away from content scripts", async () => {
    const { saveSession } = await import("@/background/session-store");
    await saveSession({ accountId: "x", password: null, keypairs: new Map([["x", Keypair.generate()]]) });
    expect(fake.area.setAccessLevel).toHaveBeenCalledWith({ accessLevel: "TRUSTED_CONTEXTS" });
  });

  it("returns nothing after a lock clears the session", async () => {
    const { saveSession, loadSession, clearSession } = await import("@/background/session-store");
    await saveSession({ accountId: "x", password: "p", keypairs: new Map([["x", Keypair.generate()]]) });
    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  it("drops a corrupt record instead of throwing", async () => {
    fake.data.brume_unlocked_session = { accountId: "x", password: null, secretKeys: { x: "bm90LWEta2V5" } };
    const { loadSession } = await import("@/background/session-store");
    expect(await loadSession()).toBeNull();
    expect(fake.data.brume_unlocked_session).toBeUndefined();
  });

  it("ignores a record whose active account has no key", async () => {
    const { saveSession, loadSession } = await import("@/background/session-store");
    await saveSession({ accountId: "missing", password: null, keypairs: new Map([["x", Keypair.generate()]]) });
    expect(await loadSession()).toBeNull();
  });
});
