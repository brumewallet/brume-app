export const BRUME_GITHUB_REPO_URL =
  "https://github.com/brume-wallet/brume-app" as const;

export const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111112";

export const SOL_BASE_UNITS_PER_SOL = 1_000_000_000n;

export const NETWORKS = {
  devnet: {
    id: "devnet" as const,
    label: "Devnet",
    rpc: "https://rpc.magicblock.app/devnet",
    explorerTx: (sig: string) =>
      `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    explorerAddress: (addr: string) =>
      `https://explorer.solana.com/address/${addr}?cluster=devnet`,
  },
  "mainnet-beta": {
    id: "mainnet-beta" as const,
    label: "Mainnet",
    // Public, rate-limited endpoint; override in Settings or with MAINNET_RPC_URL on the API.
    rpc: "https://api.mainnet-beta.solana.com",
    explorerTx: (sig: string) => `https://explorer.solana.com/tx/${sig}`,
    explorerAddress: (addr: string) =>
      `https://explorer.solana.com/address/${addr}`,
  },
} as const;

export type NetworkId = keyof typeof NETWORKS;

export const DEFAULT_NETWORK: NetworkId = "devnet";

export const DEFAULT_BRUME_API_ORIGIN = "http://localhost:3000";

export const SOL_WRAPPED_MINT =
  "So11111111111111111111111111111111111111112" as const;

export function isNetworkId(v: unknown): v is NetworkId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(NETWORKS, v);
}
