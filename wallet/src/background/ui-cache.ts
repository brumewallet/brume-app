import type { NetworkId } from "@/shared/constants";
import type { PortfolioTokenRow } from "@brume/shared";
import type { NftItem } from "./api-client";

const BALANCE_PREFIX = "brume_cache_balance_v1";
const ACTIVITY_PREFIX = "brume_cache_activity_v4";
const PORTFOLIO_PREFIX = "brume_cache_portfolio_v1";
const SHIELD_BALANCES_PREFIX = "brume_cache_shield_balances_v1";
const NFT_PREFIX = "brume_cache_nfts_v1";

function kBalance(network: NetworkId, address: string): string {
  return `${BALANCE_PREFIX}:${network}:${address}`;
}

function kActivity(network: NetworkId, address: string): string {
  return `${ACTIVITY_PREFIX}:${network}:${address}`;
}

function kPortfolio(network: NetworkId, address: string): string {
  return `${PORTFOLIO_PREFIX}:${network}:${address}`;
}

function kShieldBalances(network: NetworkId, address: string): string {
  return `${SHIELD_BALANCES_PREFIX}:${network}:${address}`;
}

function kNfts(network: NetworkId, address: string): string {
  return `${NFT_PREFIX}:${network}:${address}`;
}

export async function readBalanceCache(
  network: NetworkId,
  address: string,
): Promise<string | null> {
  const raw = await chrome.storage.local.get(kBalance(network, address));
  const row = raw[kBalance(network, address)] as
    | { balanceSolBaseUnits: string; t: number }
    | undefined;
  if (!row?.balanceSolBaseUnits) return null;
  return row.balanceSolBaseUnits;
}

export async function writeBalanceCache(
  network: NetworkId,
  address: string,
  balanceSolBaseUnits: string,
): Promise<void> {
  await chrome.storage.local.set({
    [kBalance(network, address)]: {
      balanceSolBaseUnits,
      t: Date.now(),
    },
  });
}

export const ACTIVITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type ActivityCachePayload = {
  items: unknown[];
  network: NetworkId;
  source?: "rpc-enriched" | "helius" | "api";
  rpcError?: string;
};

export async function readActivityCache(
  network: NetworkId,
  address: string,
): Promise<{ payload: ActivityCachePayload; cachedAt: number } | null> {
  const key = kActivity(network, address);
  const raw = await chrome.storage.local.get(key);
  const row = raw[key] as
    | {
        t: number;
        payload: ActivityCachePayload;
      }
    | undefined;
  if (!row?.payload || Date.now() - row.t > ACTIVITY_CACHE_TTL_MS) return null;
  return { payload: row.payload, cachedAt: row.t };
}

export async function writeActivityCache(
  network: NetworkId,
  address: string,
  payload: ActivityCachePayload,
): Promise<void> {
  await chrome.storage.local.set({
    [kActivity(network, address)]: { t: Date.now(), payload },
  });
}

export type CachedPortfolioToken = PortfolioTokenRow;

export const PORTFOLIO_CACHE_TTL_MS = 3 * 60 * 1000;

export type PortfolioCacheEntry = {
  tokens: CachedPortfolioToken[];
  cachedAt: number;
};

export async function readPortfolioCacheEntry(
  network: NetworkId,
  address: string,
): Promise<PortfolioCacheEntry | null> {
  const key = kPortfolio(network, address);
  const raw = await chrome.storage.local.get(key);
  const row = raw[key] as
    | { tokens?: CachedPortfolioToken[]; t?: number }
    | undefined;
  if (!row || !Array.isArray(row.tokens) || typeof row.t !== "number") {
    return null;
  }
  return { tokens: row.tokens, cachedAt: row.t };
}

export function isPortfolioCacheFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < PORTFOLIO_CACHE_TTL_MS;
}

export async function readPortfolioCache(
  network: NetworkId,
  address: string,
): Promise<CachedPortfolioToken[] | null> {
  const e = await readPortfolioCacheEntry(network, address);
  return e ? e.tokens : null;
}

export async function writePortfolioCache(
  network: NetworkId,
  address: string,
  tokens: CachedPortfolioToken[],
): Promise<void> {
  await chrome.storage.local.set({
    [kPortfolio(network, address)]: { t: Date.now(), tokens },
  });
}

export const NFT_CACHE_TTL_MS = 5 * 60 * 1000;

export async function readNftCache(
  network: NetworkId,
  address: string,
): Promise<{ nfts: NftItem[]; cachedAt: number } | null> {
  const key = kNfts(network, address);
  const raw = await chrome.storage.local.get(key);
  const row = raw[key] as { nfts?: NftItem[]; t?: number } | undefined;
  if (!row || !Array.isArray(row.nfts) || typeof row.t !== "number") return null;
  if (Date.now() - row.t > NFT_CACHE_TTL_MS) return null;
  return { nfts: row.nfts, cachedAt: row.t };
}

export async function writeNftCache(
  network: NetworkId,
  address: string,
  nfts: NftItem[],
): Promise<void> {
  await chrome.storage.local.set({
    [kNfts(network, address)]: { t: Date.now(), nfts },
  });
}

export const SHIELD_BALANCES_CACHE_TTL_MS = 3 * 60 * 1000;

export type ShieldBalancesCacheEntry = {
  balances: Record<string, string>;
  cachedAt: number;
};

export function isShieldBalancesCacheFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < SHIELD_BALANCES_CACHE_TTL_MS;
}

export async function readShieldBalancesCacheEntry(
  network: NetworkId,
  address: string,
): Promise<ShieldBalancesCacheEntry | null> {
  const key = kShieldBalances(network, address);
  const raw = await chrome.storage.local.get(key);
  const row = raw[key] as
    | { balances?: Record<string, string>; t?: number }
    | undefined;
  if (
    !row ||
    typeof row.t !== "number" ||
    !row.balances ||
    typeof row.balances !== "object"
  ) {
    return null;
  }
  return { balances: { ...row.balances }, cachedAt: row.t };
}

export async function writeShieldBalancesCache(
  network: NetworkId,
  address: string,
  balances: Record<string, string>,
): Promise<void> {
  await chrome.storage.local.set({
    [kShieldBalances(network, address)]: {
      t: Date.now(),
      balances: { ...balances },
    },
  });
}
