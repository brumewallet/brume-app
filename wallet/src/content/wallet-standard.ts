// Wallet Standard registration, so dApps built on @solana/wallet-adapter
// (and any other Wallet Standard app) list Brume without a custom adapter.
// Spec: https://github.com/wallet-standard/wallet-standard
import { decodeBase58 } from "@/shared/base58";

type Post = (method: string, extra?: Record<string, unknown>) => Promise<unknown>;

type Chain = "solana:mainnet" | "solana:devnet";
const CHAINS: readonly Chain[] = ["solana:mainnet", "solana:devnet"];
const ACCOUNT_FEATURES = [
  "solana:signAndSendTransaction",
  "solana:signTransaction",
  "solana:signMessage",
] as const;

const MARK_PATH =
  "M200 332.046C200 265.747 253.726 212 320 212H484.36V320.316C477.732 387.043 427.038 440.813 361.773 452.141C355.696 453.196 351 458.31 351 464.481V473.992C351 480.163 355.696 485.276 361.773 486.331C423.486 497.044 472.171 545.703 482.892 607.382C483.948 613.461 489.06 618.157 495.228 618.157H504.77C510.937 618.157 516.049 613.461 517.105 607.382C527.826 545.703 576.513 497.044 638.227 486.331C644.304 485.276 649 480.163 649 473.992V464.481C649 458.31 644.304 453.196 638.227 452.141C572.961 440.813 522.265 387.043 515.637 320.316V212H680C746.274 212 800 265.747 800 332.046V547.908C800 588.045 779.948 625.528 746.564 647.792L566.564 767.838C526.257 794.721 473.743 794.721 433.436 767.838L253.437 647.792C220.053 625.528 200 588.046 200 547.908V332.046Z";
const ICON = `data:image/svg+xml;base64,${btoa(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><rect width="1000" height="1000" rx="220" fill="#14112b"/><path d="${MARK_PATH}" fill="#ffffff"/></svg>`,
)}` as const;

class BrumeAccount {
  readonly address: string;
  readonly publicKey: Uint8Array;
  readonly chains = CHAINS;
  readonly features = ACCOUNT_FEATURES;
  readonly icon = ICON;

  constructor(address: string) {
    this.address = address;
    this.publicKey = decodeBase58(address);
  }
}

type ChangeListener = (props: { accounts: readonly BrumeAccount[] }) => void;

export type StandardBridge = {
  /** Keep the standard wallet in sync when the legacy `window.solana` API connects. */
  setAddress(address: string | null): void;
};

type Io = {
  post: Post;
  toB64(u8: Uint8Array): string;
  fromB64(b64: string): Uint8Array;
  /** Tell the legacy provider about a connect/disconnect made through the standard API. */
  onAddress(address: string | null): void;
};

export function registerStandardWallet(io: Io): StandardBridge {
  let account: BrumeAccount | null = null;
  const listeners = new Set<ChangeListener>();

  function setAddress(address: string | null, notifyLegacy: boolean): void {
    if ((account?.address ?? null) === address) return;
    account = address ? new BrumeAccount(address) : null;
    const accounts = account ? [account] : [];
    listeners.forEach((fn) => {
      try {
        fn({ accounts });
      } catch {
        // ignore listener errors
      }
    });
    if (notifyLegacy) io.onAddress(address);
  }

  function requireAccount(address: string): void {
    if (!account || account.address !== address) {
      throw new Error("Account not connected");
    }
  }

  const wallet = {
    version: "1.0.0" as const,
    name: "Brume",
    icon: ICON,
    chains: CHAINS,
    get accounts(): readonly BrumeAccount[] {
      return account ? [account] : [];
    },
    features: {
      "standard:connect": {
        version: "1.0.0" as const,
        async connect(input?: { silent?: boolean }) {
          if (input?.silent) {
            const res = (await io.post("getAccounts")) as { accounts: string[] };
            setAddress(res.accounts[0] ?? null, true);
          } else {
            const res = (await io.post("connect")) as { publicKey: string };
            setAddress(res.publicKey, true);
          }
          return { accounts: wallet.accounts };
        },
      },
      "standard:disconnect": {
        version: "1.0.0" as const,
        async disconnect() {
          await io.post("disconnect");
          setAddress(null, true);
        },
      },
      "standard:events": {
        version: "1.0.0" as const,
        on(event: "change", listener: ChangeListener) {
          if (event !== "change") return () => {};
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      "solana:signAndSendTransaction": {
        version: "1.0.0" as const,
        supportedTransactionVersions: ["legacy", 0] as const,
        async signAndSendTransaction(
          ...inputs: {
            account: { address: string };
            transaction: Uint8Array;
            chain?: string;
            options?: { skipPreflight?: boolean };
          }[]
        ) {
          inputs.forEach((i) => requireAccount(i.account.address));
          // One approval per transaction, sent in order: later ones may depend on earlier ones.
          const outputs: { signature: Uint8Array }[] = [];
          for (const i of inputs) {
            const out = (await io.post("signAndSendTransaction", {
              serializedTransaction: io.toB64(i.transaction),
              chain: i.chain,
              skipPreflight: i.options?.skipPreflight === true,
            })) as { signature: string };
            outputs.push({ signature: decodeBase58(out.signature) });
          }
          return outputs;
        },
      },
      "solana:signTransaction": {
        version: "1.0.0" as const,
        supportedTransactionVersions: ["legacy", 0] as const,
        async signTransaction(
          ...inputs: { account: { address: string }; transaction: Uint8Array }[]
        ) {
          inputs.forEach((i) => requireAccount(i.account.address));
          if (inputs.length === 1) {
            const out = (await io.post("signTransaction", {
              serializedTransaction: io.toB64(inputs[0]!.transaction),
            })) as { signedTransaction: string };
            return [{ signedTransaction: io.fromB64(out.signedTransaction) }];
          }
          const out = (await io.post("signAllTransactions", {
            serializedTransactions: inputs.map((i) => io.toB64(i.transaction)),
          })) as { signedTransactions: string[] };
          return out.signedTransactions.map((b64) => ({
            signedTransaction: io.fromB64(b64),
          }));
        },
      },
      "solana:signMessage": {
        version: "1.0.0" as const,
        async signMessage(
          ...inputs: { account: { address: string }; message: Uint8Array }[]
        ) {
          const outputs: { signedMessage: Uint8Array; signature: Uint8Array }[] = [];
          for (const i of inputs) {
            requireAccount(i.account.address);
            const out = (await io.post("signMessage", {
              message: io.toB64(i.message),
            })) as { signature: string };
            outputs.push({ signedMessage: i.message, signature: io.fromB64(out.signature) });
          }
          return outputs;
        },
      },
    },
  };

  const callback = (api: { register(w: typeof wallet): unknown }) => {
    api.register(wallet);
  };
  try {
    window.dispatchEvent(
      new CustomEvent("wallet-standard:register-wallet", { detail: callback }),
    );
  } catch (e) {
    console.error("[Brume] wallet-standard:register-wallet failed", e);
  }
  try {
    window.addEventListener("wallet-standard:app-ready", (ev) => {
      callback((ev as CustomEvent<{ register(w: typeof wallet): unknown }>).detail);
    });
  } catch (e) {
    console.error("[Brume] wallet-standard:app-ready listener failed", e);
  }

  return { setAddress: (address) => setAddress(address, false) };
}
