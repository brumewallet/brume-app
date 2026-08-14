import type { NetworkId } from "@/shared/constants";
import rawList from "@token-list/tokens/solana.tokenlist.json";

export interface TokenListEntry {
  readonly chainId: number;
  readonly address: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoURI?: string;
  readonly tags?: string[];
  readonly extensions?: Record<string, string | undefined>;
}

interface TokenListFile {
  readonly tokens: TokenListEntry[];
}

const data = rawList as TokenListFile;

const CHAIN_FOR_NETWORK: Record<NetworkId, number> = {
  devnet: 103,
  "mainnet-beta": 101,
};

export const WRAPPED_SOL_MINT =
  "So11111111111111111111111111111111111111112" as const;

function key(mint: string, chainId: number) {
  return `${mint}\0${chainId}`;
}

let registry: Map<string, TokenListEntry> | null = null;

function getRegistry(): Map<string, TokenListEntry> {
  if (!registry) {
    registry = new Map();
    for (const t of data.tokens) {
      const k = key(t.address, t.chainId);
      if (!registry.has(k)) registry.set(k, t);
    }
  }
  return registry;
}

// well-known mints resolve the same way in every environment.

export function getTokenListEntry(
  mint: string,
  network: NetworkId,
): TokenListEntry | null {
  const map = getRegistry();
  const chainId = CHAIN_FOR_NETWORK[network];
  const primary = map.get(key(mint, chainId));
  if (primary) return primary;
  if (network === "devnet") {
    const fallback = map.get(key(mint, 101));
    if (fallback) return fallback;
  }
  return null;
}

export function getNativeSolDisplay(network: NetworkId) {
  const entry = getTokenListEntry(WRAPPED_SOL_MINT, network);
  return {
    name: "Solana",
    symbol: entry?.symbol ?? "SOL",
    decimals: entry?.decimals ?? 9,
    logoURI: entry?.logoURI ?? null,
    coingeckoId: entry?.extensions?.coingeckoId ?? "solana",
    fromRegistry: entry != null,
  };
}
