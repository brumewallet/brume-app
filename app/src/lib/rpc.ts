import { NETWORKS, isNetworkId, type NetworkId } from "@brume/shared";

const ENV_RPC: Record<NetworkId, string | undefined> = {
  devnet: process.env.DEVNET_RPC_URL,
  "mainnet-beta": process.env.MAINNET_RPC_URL,
};

// Network from a query param; unknown values fall back to devnet.
export function networkFromParam(value: string | null): NetworkId {
  return isNetworkId(value) ? value : "devnet";
}

// Server-side RPC for a network: env override (e.g. a paid provider), else the shared default.
export function defaultRpcUrl(network: NetworkId): string {
  return ENV_RPC[network]?.trim() || NETWORKS[network].rpc;
}
