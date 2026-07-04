import type { NetworkId } from "./constants";

export type ExplorerId = "orb";

export const EXPLORER_OPTIONS: readonly { id: ExplorerId; label: string; subtitle?: string }[] = [
  { id: "orb", label: "Helius Orb", subtitle: "orbmarkets.io" },
] as const;

export const DEFAULT_EXPLORER_ID: ExplorerId = "orb";

export function isExplorerId(v: string): v is ExplorerId {
  return v === "orb";
}

function orbCluster(network: NetworkId): string {
  return network === "devnet" ? "?cluster=devnet" : "?cluster=mainnet-beta";
}

export function explorerTxUrl(explorer: ExplorerId, network: NetworkId, signature: string): string {
  void explorer;
  return `https://orbmarkets.io/tx/${encodeURIComponent(signature)}${orbCluster(network)}`;
}

export function explorerAddressUrl(explorer: ExplorerId, network: NetworkId, address: string): string {
  void explorer;
  return `https://orbmarkets.io/address/${encodeURIComponent(address)}${orbCluster(network)}`;
}

export function explorerMintUrl(explorer: ExplorerId, network: NetworkId, mint: string): string {
  void explorer;
  return `https://orbmarkets.io/address/${encodeURIComponent(mint)}${orbCluster(network)}`;
}

export function normalizeExplorerId(_raw: unknown): ExplorerId {
  return "orb";
}
