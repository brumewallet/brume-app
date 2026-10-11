// Wallet Standard provider: the shape @solana/wallet-adapter checks, and the bridge calls it makes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeBase58 } from "@/shared/base58";
import { registerStandardWallet } from "@/content/wallet-standard";

const ADDRESS = encodeBase58(new Uint8Array(32).fill(7));

const toB64 = (u8: Uint8Array) => Buffer.from(u8).toString("base64");
const fromB64 = (b64: string) => new Uint8Array(Buffer.from(b64, "base64"));

type Registered = {
  name: string;
  icon: string;
  chains: readonly string[];
  accounts: readonly { address: string; publicKey: Uint8Array }[];
  features: Record<string, any>;
};

function setup(post: (method: string, extra?: Record<string, unknown>) => Promise<unknown>) {
  const onAddress = vi.fn();
  let wallet: Registered | undefined;
  window.addEventListener("wallet-standard:register-wallet", (ev) => {
    (ev as CustomEvent).detail({ register: (w: Registered) => (wallet = w) });
  });
  const bridge = registerStandardWallet({ post, toB64, fromB64, onAddress });
  if (!wallet) throw new Error("wallet was not registered");
  return { wallet, bridge, onAddress };
}

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerStandardWallet", () => {
  it("registers with the features wallet-adapter requires", () => {
    const { wallet } = setup(async () => null);
    expect(wallet.name).toBe("Brume");
    expect(wallet.icon).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(wallet.chains).toContain("solana:mainnet");
    expect(Object.keys(wallet.features)).toEqual(
      expect.arrayContaining([
        "standard:connect",
        "standard:events",
        "standard:disconnect",
        "solana:signAndSendTransaction",
        "solana:signTransaction",
        "solana:signMessage",
      ]),
    );
    expect(wallet.accounts).toEqual([]);
  });

  it("registers again when an app loads after the wallet", () => {
    const { wallet } = setup(async () => null);
    const register = vi.fn();
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register } }));
    expect(register).toHaveBeenCalledWith(wallet);
  });

  it("connect asks the bridge, exposes the account, and notifies listeners and the legacy provider", async () => {
    const post = vi.fn(async () => ({ publicKey: ADDRESS }));
    const { wallet, onAddress } = setup(post);
    const change = vi.fn();
    wallet.features["standard:events"].on("change", change);

    const { accounts } = await wallet.features["standard:connect"].connect();

    expect(post).toHaveBeenCalledWith("connect");
    expect(accounts[0].address).toBe(ADDRESS);
    expect(accounts[0].publicKey).toEqual(new Uint8Array(32).fill(7));
    expect(change).toHaveBeenCalledTimes(1);
    expect(onAddress).toHaveBeenCalledWith(ADDRESS);
  });

  it("silent connect never opens an approval, it only reads granted accounts", async () => {
    const post = vi.fn(async () => ({ accounts: [] }));
    const { wallet } = setup(post);
    const { accounts } = await wallet.features["standard:connect"].connect({ silent: true });
    expect(post).toHaveBeenCalledWith("getAccounts");
    expect(accounts).toEqual([]);
  });

  it("signs one transaction with signTransaction and several with signAllTransactions", async () => {
    const tx1 = new Uint8Array([1, 2, 3]);
    const tx2 = new Uint8Array([4, 5]);
    const post = vi.fn(async (method: string, extra?: Record<string, unknown>) => {
      if (method === "connect") return { publicKey: ADDRESS };
      if (method === "signTransaction") return { signedTransaction: extra!.serializedTransaction };
      if (method === "signAllTransactions") return { signedTransactions: extra!.serializedTransactions };
      throw new Error(method);
    });
    const { wallet } = setup(post);
    const [account] = (await wallet.features["standard:connect"].connect()).accounts;
    const sign = wallet.features["solana:signTransaction"].signTransaction;

    const one = await sign({ account, transaction: tx1 });
    expect(post).toHaveBeenCalledWith("signTransaction", { serializedTransaction: toB64(tx1) });
    expect(one[0].signedTransaction).toEqual(tx1);

    const two = await sign({ account, transaction: tx1 }, { account, transaction: tx2 });
    expect(post).toHaveBeenCalledWith("signAllTransactions", {
      serializedTransactions: [toB64(tx1), toB64(tx2)],
    });
    expect(two.map((o: { signedTransaction: Uint8Array }) => o.signedTransaction)).toEqual([tx1, tx2]);
  });

  it("signAndSend asks the wallet to broadcast and returns the signature bytes", async () => {
    const tx = new Uint8Array([9, 9]);
    const sig = new Uint8Array(64).fill(3);
    const post = vi.fn(async (method: string) => {
      if (method === "connect") return { publicKey: ADDRESS };
      if (method === "signAndSendTransaction") return { signature: encodeBase58(sig) };
      throw new Error(method);
    });
    const { wallet } = setup(post);
    const [account] = (await wallet.features["standard:connect"].connect()).accounts;

    const out = await wallet.features["solana:signAndSendTransaction"].signAndSendTransaction({
      account,
      transaction: tx,
      chain: "solana:devnet",
      options: { skipPreflight: true },
    });

    expect(post).toHaveBeenCalledWith("signAndSendTransaction", {
      serializedTransaction: toB64(tx),
      chain: "solana:devnet",
      skipPreflight: true,
    });
    expect(out[0].signature).toEqual(sig);
  });

  it("refuses to sign for an account that is not connected", async () => {
    const post = vi.fn(async () => ({ signature: "" }));
    const { wallet } = setup(post);
    await expect(
      wallet.features["solana:signMessage"].signMessage({
        account: { address: ADDRESS },
        message: new Uint8Array([1]),
      }),
    ).rejects.toThrow("Account not connected");
    expect(post).not.toHaveBeenCalled();
  });

  it("follows legacy connects without echoing them back", () => {
    const { wallet, bridge, onAddress } = setup(async () => null);
    bridge.setAddress(ADDRESS);
    expect(wallet.accounts[0]?.address).toBe(ADDRESS);
    bridge.setAddress(null);
    expect(wallet.accounts).toEqual([]);
    expect(onAddress).not.toHaveBeenCalled();
  });
});
