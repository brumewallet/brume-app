// Monorepo (wallet + API + shared) on GitHub.
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
    rpc: "https://rpc.magicblock.app/mainnet",
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

export const MAGICBLOCK_PAYMENTS_API_BASE_URL =
  "https://payments.magicblock.app";

export const MAGICBLOCK_DEVNET_TEE_ER_HTTP =
  "https://devnet-tee.magicblock.app" as const;

export const MAGICBLOCK_DEVNET_TEE_VALIDATOR =
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA" as const;

export function paymentsClusterForNetwork(
  network: NetworkId,
): "devnet" | "mainnet" {
  return network === "mainnet-beta" ? "mainnet" : "devnet";
}

export const MAGICBLOCK_PER_EPHEMERAL_HTTP_DEVNET =
  "https://devnet-as.magicblock.app" as const;
export const MAGICBLOCK_PER_EPHEMERAL_HTTP_MAINNET =
  "https://tee.magicblock.app" as const;

export function magicblockPerEphemeralSubmitHttp(network: NetworkId): string {
  return network === "mainnet-beta"
    ? MAGICBLOCK_PER_EPHEMERAL_HTTP_MAINNET
    : MAGICBLOCK_PER_EPHEMERAL_HTTP_DEVNET;
}

// 
// Base URL for PER Bearer auth (`GET /auth/challenge`, `POST /auth/login`).
// Devnet: `devnet-as` is JSON-RPC–only and rejects REST auth; use `devnet-tee` for auth
// and keep `devnet-as` for `sendRawTransaction` (see `magicblockPerEphemeralSubmitHttp`).

export function magicblockPerEphemeralAuthHttp(network: NetworkId): string {
  if (network === "devnet") {
    return MAGICBLOCK_DEVNET_TEE_ER_HTTP.replace(/\/+$/, "");
  }
  return magicblockPerEphemeralSubmitHttp(network).replace(/\/+$/, "");
}

// 
// When true, Brume does not call `verifyTeeRpcIntegrity` before `getAuthToken`.
// Devnet: MagicBlock `/quote` often returns a structured `error` object; the SDK does
// `throw new Error(responseBody.error)` which becomes `Error: [object Object]`. TEE
// quote verification also depends on external PCCS. Ephemeral submit still uses Bearer
// auth from `getAuthToken`.

export function magicblockPerEphemeralSkipTeeIntegrityVerify(
  network: NetworkId,
): boolean {
  return network === "devnet";
}

export function isShieldFeatureEnabled(network: NetworkId): boolean {
  return network === "devnet";
}
