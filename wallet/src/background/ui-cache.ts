// Disk cache for balances, portfolio, shielded balances, NFTs and activity, so
// the UI can paint immediately after unlock while fresh data loads.
//
// Holdings are private, so every entry is sealed with AES-256-GCM. The key is
// derived (HKDF-SHA256) from the owning account's secret key, which only exists
// in memory while the wallet is unlocked: a locked wallet cannot read or write
// the cache, and the plaintext never touches chrome.storage.local. The storage
// key is bound as AAD so entries cannot be swapped between accounts/networks.
import type { NetworkId } from "@/shared/constants";
import type { PortfolioTokenRow } from "@brume/shared";
import { base64ToBytes, bytesToBase64, randomBytes } from "@/shared/crypto";
import type { NftItem } from "./api-client";

const CACHE_NAMESPACE = "brume_cache_";
const BALANCE_PREFIX = "brume_cache_balance_v2";
const ACTIVITY_PREFIX = "brume_cache_activity_v5";
const PORTFOLIO_PREFIX = "brume_cache_portfolio_v2";
const SHIELD_BALANCES_PREFIX = "brume_cache_shield_balances_v2";
const NFT_PREFIX = "brume_cache_nfts_v2";
const CURRENT_PREFIXES = [
  BALANCE_PREFIX,
  ACTIVITY_PREFIX,
  PORTFOLIO_PREFIX,
  SHIELD_BALANCES_PREFIX,
  NFT_PREFIX,
];

const HKDF_SALT = new TextEncoder().encode("brume-ui-cache-v1");

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

// --- Encryption ---

type SecretKeyLookup = (address: string) => Uint8Array | null;

let lookupSecretKey: SecretKeyLookup = () => null;
const derivedKeys = new Map<string, Promise<CryptoKey>>();

/** Wires the cache to the unlocked session. Returning null means "locked". */
export function setUiCacheSecretKeyLookup(fn: SecretKeyLookup): void {
  lookupSecretKey = fn;
  derivedKeys.clear();
}

/** Drops derived keys from memory; call on lock. */
export function forgetUiCacheKeys(): void {
  derivedKeys.clear();
}

async function cacheKeyFor(address: string): Promise<CryptoKey | null> {
  // Ask the session every time so a lock takes effect even if keys linger.
  const secret = lookupSecretKey(address);
  if (!secret) return null;
  let key = derivedKeys.get(address);
  if (!key) {
    key = (async () => {
      const ikm = await crypto.subtle.importKey(
        "raw",
        secret.slice(0, 32),
        "HKDF",
        false,
        ["deriveKey"],
      );
      return crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: HKDF_SALT,
          info: new TextEncoder().encode(address),
        },
        ikm,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
    derivedKeys.set(address, key);
  }
  return key;
}

type SealedRow = { v: 1; iv: string; ct: string };

function isSealedRow(x: unknown): x is SealedRow {
  const r = x as SealedRow | undefined;
  return !!r && r.v === 1 && typeof r.iv === "string" && typeof r.ct === "string";
}

async function readSealed<T>(storageKey: string, address: string): Promise<T | null> {
  const key = await cacheKeyFor(address);
  if (!key) return null;
  const row = (await chrome.storage.local.get(storageKey))[storageKey];
  if (row === undefined) return null;
  if (!isSealedRow(row)) {
    await chrome.storage.local.remove(storageKey);
    return null;
  }
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(row.iv),
        additionalData: new TextEncoder().encode(storageKey),
      },
      key,
      base64ToBytes(row.ct),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    // Tampered, or written by a different key (e.g. wallet re-created).
    await chrome.storage.local.remove(storageKey);
    return null;
  }
}

async function writeSealed(
  storageKey: string,
  address: string,
  value: unknown,
): Promise<void> {
  const key = await cacheKeyFor(address);
  if (!key) return;
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(storageKey),
    },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const row: SealedRow = {
    v: 1,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
  };
  await chrome.storage.local.set({ [storageKey]: row });
}

async function removeCacheKeys(
  keep: (storageKey: string) => boolean,
): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const stale = Object.keys(all).filter(
    (k) => k.startsWith(CACHE_NAMESPACE) && !keep(k),
  );
  if (stale.length > 0) await chrome.storage.local.remove(stale);
}

/** Deletes cache rows from older, unencrypted versions. */
export async function purgeLegacyUiCache(): Promise<void> {
  await removeCacheKeys((k) =>
    CURRENT_PREFIXES.some((p) => k.startsWith(`${p}:`)),
  );
}

/** Deletes every cache row; call when the wallet is reset. */
export async function clearUiCache(): Promise<void> {
  derivedKeys.clear();
  await removeCacheKeys(() => false);
}

// --- Balance ---

export async function readBalanceCache(
  network: NetworkId,
  address: string,
): Promise<string | null> {
  const row = await readSealed<{ balanceSolBaseUnits: string; t: number }>(
    kBalance(network, address),
    address,
  );
  if (!row?.balanceSolBaseUnits) return null;
  return row.balanceSolBaseUnits;
}

export async function writeBalanceCache(
  network: NetworkId,
  address: string,
  balanceSolBaseUnits: string,
): Promise<void> {
  await writeSealed(kBalance(network, address), address, {
    balanceSolBaseUnits,
    t: Date.now(),
  });
}

// --- Activity ---

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
  const row = await readSealed<{ t: number; payload: ActivityCachePayload }>(
    kActivity(network, address),
    address,
  );
  if (!row?.payload || Date.now() - row.t > ACTIVITY_CACHE_TTL_MS) return null;
  return { payload: row.payload, cachedAt: row.t };
}

export async function writeActivityCache(
  network: NetworkId,
  address: string,
  payload: ActivityCachePayload,
): Promise<void> {
  await writeSealed(kActivity(network, address), address, {
    t: Date.now(),
    payload,
  });
}

// --- Portfolio ---

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
  const row = await readSealed<{ tokens?: CachedPortfolioToken[]; t?: number }>(
    kPortfolio(network, address),
    address,
  );
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
  await writeSealed(kPortfolio(network, address), address, {
    t: Date.now(),
    tokens,
  });
}

// --- NFTs ---

export const NFT_CACHE_TTL_MS = 5 * 60 * 1000;

export async function readNftCache(
  network: NetworkId,
  address: string,
): Promise<{ nfts: NftItem[]; cachedAt: number } | null> {
  const row = await readSealed<{ nfts?: NftItem[]; t?: number }>(
    kNfts(network, address),
    address,
  );
  if (!row || !Array.isArray(row.nfts) || typeof row.t !== "number") return null;
  if (Date.now() - row.t > NFT_CACHE_TTL_MS) return null;
  return { nfts: row.nfts, cachedAt: row.t };
}

export async function writeNftCache(
  network: NetworkId,
  address: string,
  nfts: NftItem[],
): Promise<void> {
  await writeSealed(kNfts(network, address), address, { t: Date.now(), nfts });
}

// --- Shielded balances ---

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
  const row = await readSealed<{
    balances?: Record<string, string>;
    t?: number;
  }>(kShieldBalances(network, address), address);
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
  await writeSealed(kShieldBalances(network, address), address, {
    t: Date.now(),
    balances: { ...balances },
  });
}
