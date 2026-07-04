import "@/polyfills";
import {
  DEFAULT_NETWORK,
  SOL_WRAPPED_MINT,
  isExplorerId,
  isShieldFeatureEnabled,
  normalizeExplorerId,
  type NetworkId,
} from "@/shared/constants";
import { base64ToBytes, bytesToBase64 } from "@/shared/crypto";
import { WalletErrorCodes, messageFromUnknown, walletError } from "@/shared/errors";
import {
  decryptSecretKey,
  decryptUtf8,
  encryptSecretKey,
  encryptUtf8,
} from "@/shared/keystore";
import type {
  ExtensionMessage,
  PendingConnectRequest,
  PendingSignRequest,
  PersistedVault,
  WalletAccount,
} from "@/shared/types";
import {
  keypairFromMnemonic,
  keypairFromSecretKeyImport,
  normalizeMnemonic,
} from "@/shared/wallet-core";
import { Keypair } from "@solana/web3.js";
import { ApprovalQueue } from "./approval-queue";
import {
  fetchBrumeActivity,
  fetchBrumePortfolio,
  fetchBrumeSolBalance,
} from "./api-client";
import { validateOrigin } from "./origin-guard";
import {
  burnMplCoreNft,
  burnSplToken,
  unwrapSol,
  wrapSol,
  fetchShieldBalanceInfo,
  fetchSolBalanceBaseUnits,
  requestAirdropDevnet,
  sendSolPreferMagicBlockPrivate,
  sendSplPreferMagicBlockPrivate,
  sendSplPrivateEphemeral,
  fetchSplAtaBalanceRawForOwner,
  shieldSplToken,
  signAllTransactionBytes,
  signMessageBytes,
  signTransactionBytes,
  unshieldSplToken,
} from "./rpc";
import { clearPersisted, loadVault, saveVault } from "./storage";
import {
  isPortfolioCacheFresh,
  isShieldBalancesCacheFresh,
  readActivityCache,
  readBalanceCache,
  readNftCache,
  readPortfolioCache,
  readPortfolioCacheEntry,
  readShieldBalancesCacheEntry,
  writeActivityCache,
  writeBalanceCache,
  writeNftCache,
  writePortfolioCache,
  writeShieldBalancesCache,
  type CachedPortfolioToken,
} from "./ui-cache";
import { fetchBrumeNfts, type NftItem } from "./api-client";

const UI_SURFACE_KEY = "brume_ui_surface";
const AUTO_LOCK_TIMEOUT_KEY = "brume_auto_lock_timeout_minutes";
const LAST_ACTIVITY_AT_KEY = "brume_last_activity_at";
const AUTO_LOCK_ALARM = "brume-auto-lock-check";
const DEFAULT_AUTO_LOCK_MINUTES = 15;

function isDecryptFailure(e: unknown): boolean {
  if (e instanceof DOMException) {
    return (
      e.name === "OperationError" ||
      e.message.toLowerCase().includes("decrypt") ||
      e.message.toLowerCase().includes("operation")
    );
  }
  return e instanceof Error && /decrypt|operation|unable to verify|bad decrypt/i.test(e.message);
}

async function applyUiSurface(surface: "popup" | "sidepanel"): Promise<void> {
  try {
    if (surface === "popup") {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
      await chrome.action.setPopup({ popup: "index.html" });
    } else {
      await chrome.action.setPopup({ popup: "" });
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch {
    // Side panel API may be unavailable outside Chrome
  }
}

async function loadAndApplyUiSurface(): Promise<void> {
  const raw = await chrome.storage.local.get(UI_SURFACE_KEY);
  const surface = raw[UI_SURFACE_KEY] === "popup" ? "popup" : "sidepanel";
  await applyUiSurface(surface);
}

void loadAndApplyUiSurface();

// --- Auto-lock: periodic alarm check ---
try {
  chrome.alarms.create(AUTO_LOCK_ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUTO_LOCK_ALARM) void checkAutoLock();
  });
} catch {
  // alarms may be unavailable in some test contexts
}

// Ensure defaults exist.
void (async () => {
  const raw = await chrome.storage.local.get([
    AUTO_LOCK_TIMEOUT_KEY,
    LAST_ACTIVITY_AT_KEY,
  ]);
  if (typeof raw[AUTO_LOCK_TIMEOUT_KEY] !== "number") {
    await chrome.storage.local.set({ [AUTO_LOCK_TIMEOUT_KEY]: DEFAULT_AUTO_LOCK_MINUTES });
  }
  if (typeof raw[LAST_ACTIVITY_AT_KEY] !== "number") {
    await chrome.storage.local.set({ [LAST_ACTIVITY_AT_KEY]: 0 });
  }
})();

let sessionKeypair: Keypair | null = null;
let sessionAccountId: string | null = null;
let sessionVaultPassword: string | null = null;
let unlockedKeypairs: Map<string, Keypair> | null = null;
let cachedSolBalanceBaseUnits: bigint | null = null;
let cachedPortfolioTokens: CachedPortfolioToken[] | null = null;
let cachedNfts: NftItem[] | null = null;
let cachedShieldedBalances: Record<string, string> | null = null;
let lastRpcError: string | null = null;
let lastIndexerError: string | null = null;

let pendingConnect: PendingConnectRequest | null = null;
const signQueue = new ApprovalQueue<PendingSignRequest>();

let lastActivityAt = 0;

async function getAutoLockTimeoutMinutes(): Promise<number> {
  const raw = await chrome.storage.local.get(AUTO_LOCK_TIMEOUT_KEY);
  const v = raw[AUTO_LOCK_TIMEOUT_KEY];
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? v
    : DEFAULT_AUTO_LOCK_MINUTES;
}

async function setAutoLockTimeoutMinutes(minutes: number): Promise<void> {
  await chrome.storage.local.set({ [AUTO_LOCK_TIMEOUT_KEY]: minutes });
}

async function touchActivity(now = Date.now()): Promise<void> {
  lastActivityAt = now;
  await chrome.storage.local.set({ [LAST_ACTIVITY_AT_KEY]: now });
}

async function readLastActivityAt(): Promise<number> {
  if (lastActivityAt > 0) return lastActivityAt;
  const raw = await chrome.storage.local.get(LAST_ACTIVITY_AT_KEY);
  const v = raw[LAST_ACTIVITY_AT_KEY];
  lastActivityAt = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return lastActivityAt;
}

async function checkAutoLock(): Promise<void> {
  if (!sessionKeypair) return;
  const [minutes, last] = await Promise.all([
    getAutoLockTimeoutMinutes(),
    readLastActivityAt(),
  ]);
  if (minutes === 0) return;
  if (last === 0) {
    await touchActivity();
    return;
  }
  const elapsed = Date.now() - last;
  if (elapsed >= minutes * 60_000) {
    clearWalletSession();
  }
}

function clearWalletSessionCaches(): void {
  cachedSolBalanceBaseUnits = null;
  cachedPortfolioTokens = null;
  cachedNfts = null;
  cachedShieldedBalances = null;
  lastRpcError = null;
  lastIndexerError = null;
}

function clearWalletSession(): void {
  sessionKeypair = null;
  sessionAccountId = null;
  sessionVaultPassword = null;
  unlockedKeypairs = null;
  lastActivityAt = 0;
  clearWalletSessionCaches();
}

function updateBadge(): void {
  const n = (pendingConnect ? 1 : 0) + signQueue.count();
  void chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
  void chrome.action.setBadgeBackgroundColor({ color: "#2dd4bf" });
}

function accountById(
  vault: PersistedVault,
  id: string,
): WalletAccount | undefined {
  return vault.accounts.find((a) => a.id === id);
}

function getActiveAccountEntry(vault: PersistedVault): WalletAccount {
  const acc = accountById(vault, vault.activeAccountId);
  if (!acc) throw new Error("Active account missing");
  return acc;
}

async function getVaultOrThrow(): Promise<PersistedVault> {
  const v = await loadVault();
  if (!v?.accounts?.length) throw new Error("No wallet found");
  return v;
}

async function fetchAndCacheSolBalance(): Promise<void> {
  if (!sessionKeypair) return;
  const p = await loadVault();
  const network = p?.network ?? DEFAULT_NETWORK;
  const addr = sessionKeypair.publicKey.toBase58();
  const rpcUrlOverride = p?.rpcUrlOverride ?? null;

  try {
    cachedSolBalanceBaseUnits = await fetchSolBalanceBaseUnits(
      network,
      addr,
      rpcUrlOverride,
    );
    lastRpcError = null;
    await writeBalanceCache(network, addr, cachedSolBalanceBaseUnits.toString());
  } catch (e) {
    const msg = messageFromUnknown(e);
    try {
      const lamportsStr = await fetchBrumeSolBalance(
        network,
        addr,
        rpcUrlOverride,
      );
      cachedSolBalanceBaseUnits = BigInt(lamportsStr);
      lastRpcError = null;
      await writeBalanceCache(network, addr, lamportsStr);
    } catch {
      lastRpcError = msg;
      const fallback = await readBalanceCache(network, addr);
      cachedSolBalanceBaseUnits =
        fallback != null && fallback !== "" ? BigInt(fallback) : null;
    }
  }
}

async function fetchShieldBalancesMapForMints(params: {
  network: NetworkId;
  owner: string;
  mints: string[];
  rpcUrlOverride: string | null;
}): Promise<Record<string, string>> {
  const capped = [
    ...new Set(
      params.mints.map((m) => m.trim()).filter((m) => m.length >= 32),
    ),
  ].slice(0, 48);
  const entries = await Promise.all(
    capped.map(async (mintAddress) => {
      try {
        const info = await fetchShieldBalanceInfo({
          network: params.network,
          rpcUrlOverride: params.rpcUrlOverride,
          ownerAddress: params.owner,
          mintAddress,
        });
        return [mintAddress, info.privateBalanceRaw] as const;
      } catch {
        return [mintAddress, "0"] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function mergeShieldBalancesIntoCache(params: {
  network: NetworkId;
  address: string;
  patch: Record<string, string>;
}): Promise<Record<string, string>> {
  const prev =
    (await readShieldBalancesCacheEntry(params.network, params.address))
      ?.balances ?? {};
  const merged = { ...prev, ...params.patch };
  await writeShieldBalancesCache(params.network, params.address, merged);
  cachedShieldedBalances = merged;
  return merged;
}

async function applyBurnToPortfolioCache(params: {
  network: NetworkId;
  address: string;
  mint: string;
  burnAll: boolean;
  remainingAmountRaw: string | null;
}): Promise<void> {
  const { network, address, mint, burnAll, remainingAmountRaw } = params;
  let tokens: CachedPortfolioToken[] =
    cachedPortfolioTokens != null
      ? [...cachedPortfolioTokens]
      : (await readPortfolioCache(network, address)) ?? [];

  if (burnAll) {
    tokens = tokens.filter((t) => t.mint !== mint);
  } else if (remainingAmountRaw != null) {
    tokens = tokens.map((t) =>
      t.mint === mint ? { ...t, amountRaw: remainingAmountRaw } : t,
    );
    tokens = tokens.filter(
      (t) => !(t.mint === mint && BigInt(t.amountRaw) === 0n),
    );
  }

  await writePortfolioCache(network, address, tokens);
  cachedPortfolioTokens = tokens.length > 0 ? tokens : null;
}

// After shield/unshield, Brume indexer can lag; align the affected mint with base RPC (processed).

async function patchPortfolioTokenAmountFromRpcForMint(params: {
  network: NetworkId;
  address: string;
  mint: string;
  rpcUrlOverride: string | null;
}): Promise<void> {
  if (params.network !== "devnet") return;
  try {
    const raw = await fetchSplAtaBalanceRawForOwner(
      {
        network: params.network,
        ownerB58: params.address,
        mintAddress: params.mint,
        rpcUrlOverride: params.rpcUrlOverride,
      },
      "processed",
    );
    let tokens: CachedPortfolioToken[] =
      cachedPortfolioTokens != null
        ? [...cachedPortfolioTokens]
        : (await readPortfolioCache(params.network, params.address)) ?? [];

    const idx = tokens.findIndex((t) => t.mint === params.mint);
    if (idx === -1) return;

    const bi = BigInt(raw);
    if (bi === 0n) {
      tokens = tokens.filter((t) => t.mint !== params.mint);
    } else {
      tokens[idx] = { ...tokens[idx], amountRaw: raw };
    }
    await writePortfolioCache(params.network, params.address, tokens);
    cachedPortfolioTokens = tokens.length > 0 ? tokens : null;
  } catch {
    // keep indexer snapshot
  }
}

async function refreshWalletData(opts?: {
  // Ignore portfolio cache TTL; refetch from Brume API (refresh button, network/RPC change).
  forcePortfolio?: boolean;
}): Promise<void> {
  const forcePortfolio = opts?.forcePortfolio === true;
  if (!sessionKeypair) {
    cachedSolBalanceBaseUnits = null;
    cachedPortfolioTokens = null;
    cachedNfts = null;
    cachedShieldedBalances = null;
    lastRpcError = null;
    lastIndexerError = null;
    return;
  }
  const p = await loadVault();
  const network = p?.network ?? DEFAULT_NETWORK;
  const addr = sessionKeypair.publicKey.toBase58();
  const rpcUrlOverride = p?.rpcUrlOverride ?? null;

  await fetchAndCacheSolBalance();

  const portfolioEntry = await readPortfolioCacheEntry(network, addr);

  if (cachedPortfolioTokens == null && portfolioEntry) {
    cachedPortfolioTokens =
      portfolioEntry.tokens.length > 0 ? portfolioEntry.tokens : null;
  }

  const portfolioCacheFresh =
    !forcePortfolio &&
    portfolioEntry != null &&
    isPortfolioCacheFresh(portfolioEntry.cachedAt);

  if (portfolioCacheFresh) {
    lastIndexerError = null;
    cachedPortfolioTokens =
      portfolioEntry.tokens.length > 0 ? portfolioEntry.tokens : null;
  } else {
    try {
      const portfolio = await fetchBrumePortfolio(network, addr, rpcUrlOverride);
      lastIndexerError = null;
      const merged = portfolio.tokens ?? [];
      if (portfolio.nativeLamports != null && portfolio.nativeLamports !== "") {
        cachedSolBalanceBaseUnits = BigInt(portfolio.nativeLamports);
        await writeBalanceCache(
          network,
          addr,
          portfolio.nativeLamports,
        );
        lastRpcError = null;
      }
      await writePortfolioCache(network, addr, merged);
      cachedPortfolioTokens = merged.length > 0 ? merged : null;
    } catch (e) {
      const msg = messageFromUnknown(e);
      lastIndexerError = msg;
      const stale = portfolioEntry?.tokens;
      cachedPortfolioTokens =
        stale != null && stale.length > 0
          ? stale
          : cachedPortfolioTokens;
    }
  }

  if (!isShieldFeatureEnabled(network)) {
    cachedShieldedBalances = {};
  } else {
    const shieldEntry = await readShieldBalancesCacheEntry(network, addr);
    const shieldFresh =
      !forcePortfolio &&
      shieldEntry != null &&
      isShieldBalancesCacheFresh(shieldEntry.cachedAt);
    const tokenList = cachedPortfolioTokens ?? [];
    const mintsForShield = [
      ...new Set([...tokenList.map((t) => t.mint), SOL_WRAPPED_MINT]),
    ];
    if (shieldFresh) {
      cachedShieldedBalances = shieldEntry.balances;
    } else {
      const map = await fetchShieldBalancesMapForMints({
        network,
        owner: addr,
        mints: mintsForShield,
        rpcUrlOverride,
      });
      await writeShieldBalancesCache(network, addr, map);
      cachedShieldedBalances = map;
    }
  }
}

async function hydrateWalletCachesFromStorage(
  network: NetworkId,
  address: string,
): Promise<void> {
  lastRpcError = null;
  lastIndexerError = null;
  const [bal, portfolioEntry, shieldEntry] = await Promise.all([
    readBalanceCache(network, address),
    readPortfolioCacheEntry(network, address),
    readShieldBalancesCacheEntry(network, address),
  ]);
  cachedSolBalanceBaseUnits =
    bal != null && bal !== "" ? BigInt(bal) : null;
  cachedPortfolioTokens =
    portfolioEntry != null && portfolioEntry.tokens.length > 0
      ? portfolioEntry.tokens
      : null;
  cachedShieldedBalances = isShieldFeatureEnabled(network)
    ? (shieldEntry?.balances ?? null)
    : {};
}

function scheduleWalletDataRefresh(): void {
  void refreshWalletData({ forcePortfolio: true }).catch(() => {
    // logged via lastRpcError / lastIndexerError on next GET_STATE.
  });
}

async function buildUiState(): Promise<import("@/shared/types").WalletUiState> {
  const p = await loadVault();
  const hasVault = !!p?.accounts?.length;
  const locked = !sessionKeypair;
  const activeId = p?.activeAccountId ?? null;
  const activeAcc = p && activeId ? accountById(p, activeId) : undefined;
  const publicKey =
    sessionKeypair?.publicKey.toBase58() ??
    activeAcc?.keystore.address ??
    null;
  const network = p?.network ?? DEFAULT_NETWORK;

  const accounts = (p?.accounts ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    address: a.keystore.address,
  }));

  let balanceStr = cachedSolBalanceBaseUnits?.toString() ?? null;
  if (balanceStr == null && publicKey && !locked) {
    const hit = await readBalanceCache(network, publicKey);
    if (hit != null && hit !== "") balanceStr = hit;
  }

  let portfolio: typeof cachedPortfolioTokens = null;
  portfolio = cachedPortfolioTokens;
  if (portfolio == null && publicKey && !locked) {
    portfolio = await readPortfolioCache(network, publicKey);
  }

  let shieldedBalancesByMint: Record<string, string> = {};
  if (!locked && publicKey && isShieldFeatureEnabled(network)) {
    shieldedBalancesByMint = cachedShieldedBalances ?? {};
    if (Object.keys(shieldedBalancesByMint).length === 0) {
      const ent = await readShieldBalancesCacheEntry(network, publicKey);
      if (ent) {
        shieldedBalancesByMint = ent.balances;
        cachedShieldedBalances = ent.balances;
      }
    }
  }

  return {
    hasVault,
    locked,
    publicKey,
    activeAccountId: sessionAccountId ?? activeId,
    accountLabel: activeAcc?.label ?? null,
    accounts,
    network,
    balanceSolBaseUnits: balanceStr,
    rpcError: lastRpcError,
    indexerError: lastIndexerError,
    rpcUrlOverride: p?.rpcUrlOverride?.trim() || null,
    explorerId: normalizeExplorerId(p?.explorerId),
    portfolioTokens: portfolio,
    shieldedBalancesByMint,
    simpleMode: p?.simpleMode ?? true,
    pendingConnect,
    pendingSign: signQueue.peek() ?? null,
    blocklist: p?.blocklist ?? [],
    allowlist: p?.allowlist ?? [],
    hdDerivationAvailable: !!(
      p?.encryptedRootMnemonic &&
      typeof p.hdNextAccountIndex === "number"
    ),
  };
}

async function notifyTab(tabId: number, msg: unknown): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
  } catch {
    // Tab may have closed or no content script.
  }
}

function requireTabContext(sender: chrome.runtime.MessageSender): {
  tabId: number;
  origin: string;
} {
  const tabId = sender.tab?.id;
  const url = sender.tab?.url;
  if (tabId == null || !url) {
    throw new Error("No tab context");
  }
  return { tabId, origin: new URL(url).origin };
}

async function handleMessage(
  raw: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: unknown) => void,
): Promise<void> {
  try {
    switch (raw.type) {
      case "GET_STATE": {
        sendResponse({
          ok: true,
          payload: await buildUiState(),
        });
        return;
      }

      case "ACTIVITY_HEARTBEAT": {
        if (sessionKeypair) {
          await touchActivity();
        }
        sendResponse({ ok: true });
        return;
      }

      case "GET_AUTO_LOCK_TIMEOUT": {
        sendResponse({ ok: true, payload: { minutes: await getAutoLockTimeoutMinutes() } });
        return;
      }

      case "SET_AUTO_LOCK_TIMEOUT": {
        const minutes = raw.payload.minutes;
        if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
          sendResponse({ ok: false, error: walletError(4002, "Invalid timeout") });
          return;
        }
        await setAutoLockTimeoutMinutes(minutes);
        // If we're unlocked, treat changing the timeout as activity.
        if (sessionKeypair) await touchActivity();
        sendResponse({ ok: true, payload: { minutes } });
        return;
      }

      case "CREATE_WALLET":
      case "IMPORT_WALLET": {
        const phrase = raw.payload.mnemonic;
        const existing = await loadVault();
        const hasExistingVault = !!existing?.accounts?.length;
        const password =
          raw.payload.password ??
          (hasExistingVault ? sessionVaultPassword : undefined);
        if (!phrase?.trim() || !password) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              hasExistingVault
                ? "Unlock your wallet first"
                : "Mnemonic and password required",
            ),
          });
          return;
        }
        const normalized = normalizeMnemonic(phrase);
        const kp = keypairFromMnemonic(normalized);
        const ks = await encryptSecretKey(
          password,
          kp.secretKey,
          kp.publicKey.toBase58(),
        );
        const id = crypto.randomUUID();
        const newAcc: WalletAccount = {
          id,
          label: existing
            ? `Account ${existing.accounts.length + 1}`
            : "Account 1",
          keystore: ks,
          connectedOrigins: {},
        };
        if (!existing) {
          const rootKs = await encryptUtf8(password, normalized);
          await saveVault({
            version: 2,
            activeAccountId: id,
            accounts: [newAcc],
            network: DEFAULT_NETWORK,
            rpcUrlOverride: null,
            allowlist: [],
            blocklist: [],
            simpleMode: true,
            encryptedRootMnemonic: rootKs,
            hdNextAccountIndex: 1,
          });
        } else {
          existing.accounts.push(newAcc);
          existing.activeAccountId = id;
          await saveVault(existing);
        }
        sessionVaultPassword = password;
        (unlockedKeypairs ??= new Map()).set(id, kp);
        sessionKeypair = kp;
        sessionAccountId = id;
        const networkForCache = existing?.network ?? DEFAULT_NETWORK;
        await hydrateWalletCachesFromStorage(
          networkForCache,
          kp.publicKey.toBase58(),
        );
        sendResponse({ ok: true, payload: { publicKey: kp.publicKey.toBase58() } });
        scheduleWalletDataRefresh();
        return;
      }

      case "IMPORT_PRIVATE_KEY": {
        const secretKeyInput = raw.payload.secretKeyInput;
        const existing = await loadVault();
        const hasExistingVault = !!existing?.accounts?.length;
        const password =
          raw.payload.password ??
          (hasExistingVault ? sessionVaultPassword : undefined);
        if (!secretKeyInput?.trim() || !password) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              hasExistingVault
                ? "Unlock your wallet first"
                : "Private key and password required",
            ),
          });
          return;
        }
        let kp: Keypair;
        try {
          kp = keypairFromSecretKeyImport(secretKeyInput);
        } catch (e) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              e instanceof Error ? e.message : "Invalid private key",
            ),
          });
          return;
        }
        const ks = await encryptSecretKey(
          password,
          kp.secretKey,
          kp.publicKey.toBase58(),
        );
        const id = crypto.randomUUID();
        const newAcc: WalletAccount = {
          id,
          label: existing
            ? `Account ${existing.accounts.length + 1}`
            : "Account 1",
          keystore: ks,
          connectedOrigins: {},
        };
        if (!existing) {
          await saveVault({
            version: 2,
            activeAccountId: id,
            accounts: [newAcc],
            network: DEFAULT_NETWORK,
            rpcUrlOverride: null,
            allowlist: [],
            blocklist: [],
            simpleMode: true,
          });
        } else {
          existing.accounts.push(newAcc);
          existing.activeAccountId = id;
          await saveVault(existing);
        }
        sessionVaultPassword = password;
        (unlockedKeypairs ??= new Map()).set(id, kp);
        sessionKeypair = kp;
        sessionAccountId = id;
        const networkForCache = existing?.network ?? DEFAULT_NETWORK;
        await hydrateWalletCachesFromStorage(
          networkForCache,
          kp.publicKey.toBase58(),
        );
        sendResponse({ ok: true, payload: { publicKey: kp.publicKey.toBase58() } });
        scheduleWalletDataRefresh();
        return;
      }

      case "ADD_HD_ACCOUNT": {
        const password = raw.payload.password ?? sessionVaultPassword;
        if (!password) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Unlock your wallet first"),
          });
          return;
        }
        const v = await loadVault();
        if (!v?.accounts?.length) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "No wallet found"),
          });
          return;
        }
        if (!v.encryptedRootMnemonic || v.hdNextAccountIndex == null) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              "Derived accounts are not available for this wallet",
            ),
          });
          return;
        }
        let phrase: string;
        try {
          phrase = await decryptUtf8(password, v.encryptedRootMnemonic);
        } catch (e) {
          const wrongPw = isDecryptFailure(e);
          sendResponse({
            ok: false,
            error: walletError(
              WalletErrorCodes.WalletConnectionError,
              wrongPw
                ? "Incorrect password"
                : e instanceof Error
                  ? e.message
                  : "Could not unlock recovery phrase",
            ),
          });
          return;
        }
        const idx = v.hdNextAccountIndex;
        const path = `m/44'/501'/${idx}'/0'`;
        let kp: Keypair;
        try {
          kp = keypairFromMnemonic(phrase, path);
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "Invalid stored recovery phrase"),
          });
          return;
        }
        const newKs = await encryptSecretKey(
          password,
          kp.secretKey,
          kp.publicKey.toBase58(),
        );
        const id = crypto.randomUUID();
        const newAcc: WalletAccount = {
          id,
          label: `Account ${v.accounts.length + 1}`,
          keystore: newKs,
          connectedOrigins: {},
        };
        v.accounts.push(newAcc);
        v.activeAccountId = id;
        v.hdNextAccountIndex = idx + 1;
        await saveVault(v);
        (unlockedKeypairs ??= new Map()).set(id, kp);
        sessionKeypair = kp;
        sessionAccountId = id;
        await hydrateWalletCachesFromStorage(
          v.network ?? DEFAULT_NETWORK,
          kp.publicKey.toBase58(),
        );
        sendResponse({ ok: true, payload: { publicKey: kp.publicKey.toBase58() } });
        scheduleWalletDataRefresh();
        return;
      }

      case "UNLOCK": {
        const v = await getVaultOrThrow();
        const password = raw.payload.password;
        if (!password) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Password required"),
          });
          return;
        }
        const map = new Map<string, Keypair>();
        for (const acc of v.accounts) {
          try {
            const secret = await decryptSecretKey(password, acc.keystore);
            map.set(acc.id, Keypair.fromSecretKey(secret));
          } catch (e) {
            const wrongPw = isDecryptFailure(e);
            sendResponse({
              ok: false,
              error: walletError(
                WalletErrorCodes.WalletConnectionError,
                wrongPw
                  ? "Incorrect password"
                  : e instanceof Error
                    ? e.message
                    : "Unlock failed",
              ),
            });
            return;
          }
        }
        const targetId = v.activeAccountId;
        const kp = map.get(targetId);
        if (!kp) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Active account missing"),
          });
          return;
        }
        sessionVaultPassword = password;
        unlockedKeypairs = map;
        sessionKeypair = kp;
        sessionAccountId = targetId;
        await touchActivity();
        await hydrateWalletCachesFromStorage(
          v.network ?? DEFAULT_NETWORK,
          kp.publicKey.toBase58(),
        );
        sendResponse({
          ok: true,
          payload: { publicKey: kp.publicKey.toBase58() },
        });
        scheduleWalletDataRefresh();
        return;
      }

      case "SWITCH_ACCOUNT": {
        const v = await getVaultOrThrow();
        const acc = accountById(v, raw.payload.accountId);
        if (!acc) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Account not found"),
          });
          return;
        }
        const kp = unlockedKeypairs?.get(raw.payload.accountId);
        if (!kp) {
          sendResponse({
            ok: false,
            error: walletError(
              WalletErrorCodes.WalletNotReady,
              "Unlock your wallet to switch accounts",
            ),
          });
          return;
        }
        v.activeAccountId = raw.payload.accountId;
        await saveVault(v);
        sessionKeypair = kp;
        sessionAccountId = raw.payload.accountId;
        await hydrateWalletCachesFromStorage(
          v.network ?? DEFAULT_NETWORK,
          kp.publicKey.toBase58(),
        );
        sendResponse({
          ok: true,
          payload: { publicKey: kp.publicKey.toBase58() },
        });
        scheduleWalletDataRefresh();
        return;
      }

      case "RENAME_ACCOUNT": {
        const v = await getVaultOrThrow();
        const acc = accountById(v, raw.payload.accountId);
        if (!acc) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Account not found"),
          });
          return;
        }
        const next = raw.payload.label.trim().slice(0, 32);
        const accountIndex = v.accounts.findIndex((x) => x.id === acc.id);
        const defaultLabel = `Account ${accountIndex + 1}`;
        acc.label = next.length > 0 ? next : defaultLabel;
        await saveVault(v);
        sendResponse({ ok: true });
        return;
      }

      case "REMOVE_ACCOUNT": {
        const v = await getVaultOrThrow();
        const id = raw.payload.accountId;
        const idx = v.accounts.findIndex((a) => a.id === id);
        if (idx < 0) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Account not found"),
          });
          return;
        }
        v.accounts.splice(idx, 1);
        if (v.accounts.length === 0) {
          await clearPersisted();
          clearWalletSession();
          sendResponse({ ok: true });
          return;
        }
        const wasActive = v.activeAccountId === id;
        if (wasActive) {
          v.activeAccountId = v.accounts[0]!.id;
        }
        unlockedKeypairs?.delete(id);
        if (wasActive) {
          sessionAccountId = v.activeAccountId;
          sessionKeypair = unlockedKeypairs?.get(v.activeAccountId) ?? null;
          if (!sessionKeypair) {
            clearWalletSession();
          } else {
            clearWalletSessionCaches();
          }
        }
        await saveVault(v);
        if (sessionKeypair) {
          await hydrateWalletCachesFromStorage(
            v.network ?? DEFAULT_NETWORK,
            sessionKeypair.publicKey.toBase58(),
          );
          scheduleWalletDataRefresh();
        }
        sendResponse({ ok: true });
        return;
      }

      case "LOCK": {
        clearWalletSession();
        await chrome.storage.local.set({ [LAST_ACTIVITY_AT_KEY]: 0 });
        sendResponse({ ok: true });
        return;
      }

      case "SET_NETWORK": {
        const p = await getVaultOrThrow();
        p.network = raw.payload.network;
        await saveVault(p);
        // Load the cached UI data for the newly-selected network immediately,
        // so the popup can show the right cached balances/portfolio instantly.
        if (sessionKeypair) {
          try {
            await hydrateWalletCachesFromStorage(
              p.network ?? DEFAULT_NETWORK,
              sessionKeypair.publicKey.toBase58(),
            );
          } catch {
            // ignore cache hydration errors; background refresh will follow
          }
        }

        // Respond immediately; refresh in background so UI switches instantly.
        sendResponse({ ok: true, payload: { network: p.network } });
        void refreshWalletData({ forcePortfolio: true });
        return;
      }

      case "SET_SIMPLE_MODE": {
        const p = await getVaultOrThrow();
        p.simpleMode = raw.payload.simpleMode;
        await saveVault(p);
        sendResponse({ ok: true });
        return;
      }

      case "SET_RPC_URL_OVERRIDE": {
        const p = await getVaultOrThrow();
        const url = raw.payload.rpcUrl?.trim() || null;
        p.rpcUrlOverride = url;
        await saveVault(p);
        await refreshWalletData({ forcePortfolio: true });
        sendResponse({ ok: true, payload: { rpcUrl: url } });
        return;
      }

      case "SET_EXPLORER_ID": {
        const p = await getVaultOrThrow();
        const id = raw.payload.explorerId;
        if (!isExplorerId(id)) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Invalid explorer"),
          });
          return;
        }
        p.explorerId = id;
        await saveVault(p);
        sendResponse({ ok: true, payload: { explorerId: id } });
        return;
      }

      case "SET_UI_SURFACE": {
        const surface = raw.payload.surface;
        await chrome.storage.local.set({ [UI_SURFACE_KEY]: surface });
        await applyUiSurface(surface);
        sendResponse({ ok: true, payload: { surface } });
        return;
      }

      case "REFRESH_BALANCE": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        await refreshWalletData({ forcePortfolio: true });
        sendResponse({ ok: true });
        return;
      }

      case "SEND_SOL": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const sol = Number.parseFloat(raw.payload.sol);
        if (!Number.isFinite(sol) || sol <= 0) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Invalid amount"),
          });
          return;
        }
        const { signature, route } = await sendSolPreferMagicBlockPrivate({
          network: p.network,
          from: sessionKeypair,
          toAddress: raw.payload.to.trim(),
          solAmount: sol,
          rpcUrlOverride: p.rpcUrlOverride ?? null,
        });
        await refreshWalletData({ forcePortfolio: true });
        sendResponse({
          ok: true,
          payload: { signature, solSendRoute: route },
        });
        return;
      }

      case "SEND_SPL": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const mint = raw.payload.mint?.trim();
        const to = raw.payload.to?.trim();
        const amount = raw.payload.amount?.trim();
        const fromPrivateBalance = raw.payload.fromPrivateBalance === true;
        if (!mint || !to || !amount) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Mint, recipient, and amount required"),
          });
          return;
        }
        if (fromPrivateBalance && !isShieldFeatureEnabled(p.network)) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              "Shielded sends are only available on Devnet",
            ),
          });
          return;
        }
        try {
          const { signature, route } = fromPrivateBalance
            ? await sendSplPrivateEphemeral({
                network: p.network,
                from: sessionKeypair,
                toAddress: to,
                mintAddress: mint,
                amountStr: amount,
                rpcUrlOverride: p.rpcUrlOverride ?? null,
              })
            : await sendSplPreferMagicBlockPrivate({
                network: p.network,
                from: sessionKeypair,
                toAddress: to,
                mintAddress: mint,
                amountStr: amount,
                rpcUrlOverride: p.rpcUrlOverride ?? null,
              });
          await refreshWalletData({ forcePortfolio: true });
          sendResponse({
            ok: true,
            payload: { signature, splSendRoute: route },
          });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({
            ok: false,
            error: walletError(4002, m),
          });
        }
        return;
      }

      case "BURN_SPL": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const mint = raw.payload.mint?.trim();
        const amount = raw.payload.amount?.trim();
        if (!mint || !amount) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Mint and amount required"),
          });
          return;
        }
        try {
          const burn = await burnSplToken({
            network: p.network,
            from: sessionKeypair,
            mintAddress: mint,
            amountStr: amount,
            rpcUrlOverride: p.rpcUrlOverride ?? null,
          });
          await applyBurnToPortfolioCache({
            network: p.network,
            address: sessionKeypair.publicKey.toBase58(),
            mint,
            burnAll: burn.burnAll,
            remainingAmountRaw: burn.remainingAmountRaw,
          });
          await fetchAndCacheSolBalance();
          sendResponse({ ok: true, payload: { signature: burn.signature } });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({
            ok: false,
            error: walletError(4002, m),
          });
        }
        return;
      }

      case "WRAP_SOL": {
        if (!sessionKeypair) {
          sendResponse({ ok: false, error: walletError(WalletErrorCodes.WalletNotReady, "Locked") });
          return;
        }
        const p = await getVaultOrThrow();
        const amountSol = raw.payload.amountSol?.trim();
        if (!amountSol) {
          sendResponse({ ok: false, error: walletError(4002, "Amount required") });
          return;
        }
        try {
          const result = await wrapSol({
            network: p.network,
            from: sessionKeypair,
            amountSol,
            rpcUrlOverride: p.rpcUrlOverride ?? null,
          });
          await fetchAndCacheSolBalance();
          cachedPortfolioTokens = null;
          sendResponse({ ok: true, payload: { signature: result.signature } });
        } catch (e) {
          sendResponse({ ok: false, error: walletError(4002, messageFromUnknown(e)) });
        }
        return;
      }

      case "UNWRAP_SOL": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        try {
          const result = await unwrapSol({
            network: p.network,
            from: sessionKeypair,
            rpcUrlOverride: p.rpcUrlOverride ?? null,
          });
          // Remove wSOL from portfolio cache since ATA is now closed
          await applyBurnToPortfolioCache({
            network: p.network,
            address: sessionKeypair.publicKey.toBase58(),
            mint: SOL_WRAPPED_MINT,
            burnAll: true,
            remainingAmountRaw: null,
          });
          await fetchAndCacheSolBalance();
          sendResponse({ ok: true, payload: { signature: result.signature } });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({ ok: false, error: walletError(4002, m) });
        }
        return;
      }

      case "GET_NFTS": {
        const p = await loadVault();
        const addr = sessionKeypair?.publicKey.toBase58() ?? (p?.accounts?.length ? (() => { try { return getActiveAccountEntry(p!).keystore.address; } catch { return null; } })() : null);
        if (!addr) {
          sendResponse({ ok: true, payload: { nfts: [] } });
          return;
        }
        const network = p?.network ?? DEFAULT_NETWORK;
        const forceRefresh = raw.payload?.refresh === true;

        if (!forceRefresh && cachedNfts !== null) {
          sendResponse({ ok: true, payload: { nfts: cachedNfts, cached: true } });
          return;
        }
        if (!forceRefresh) {
          const disk = await readNftCache(network, addr);
          if (disk) {
            cachedNfts = disk.nfts;
            sendResponse({ ok: true, payload: { nfts: disk.nfts, cached: true, cachedAt: disk.cachedAt } });
            return;
          }
        }
        try {
          const res = await fetchBrumeNfts(network, addr, p?.rpcUrlOverride ?? null);
          cachedNfts = res.nfts;
          await writeNftCache(network, addr, res.nfts);
          sendResponse({ ok: true, payload: { nfts: res.nfts, cached: false } });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({ ok: false, error: walletError(4002, m) });
        }
        return;
      }

      case "BURN_NFT": {
        if (!sessionKeypair) {
          sendResponse({ ok: false, error: walletError(WalletErrorCodes.WalletNotReady, "Locked") });
          return;
        }
        const p = await getVaultOrThrow();
        const { mint, collection, standard } = raw.payload;
        if (!mint) {
          sendResponse({ ok: false, error: walletError(4002, "Mint required") });
          return;
        }
        try {
          let sig: string;
          if (standard === "mpl-core") {
            sig = await burnMplCoreNft({
              network: p.network,
              from: sessionKeypair,
              assetAddress: mint,
              collectionAddress: collection ?? null,
              rpcUrlOverride: p.rpcUrlOverride ?? null,
            });
          } else if (standard === "legacy") {
            const result = await burnSplToken({
              network: p.network,
              from: sessionKeypair,
              mintAddress: mint,
              amountStr: "all",
              rpcUrlOverride: p.rpcUrlOverride ?? null,
            });
            sig = result.signature;
          } else {
            throw new Error("Programmable NFT burn not yet supported");
          }
          // Remove burned NFT from in-memory cache so next GET_NFTS is up-to-date
          if (cachedNfts !== null) {
            cachedNfts = cachedNfts.filter((n) => n.mint !== mint);
          }
          await fetchAndCacheSolBalance();
          sendResponse({ ok: true, payload: { signature: sig } });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({ ok: false, error: walletError(4002, m) });
        }
        return;
      }

      case "GET_SHIELD_BALANCES": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        if (!isShieldFeatureEnabled(p.network)) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              "Shield is only available on Devnet",
            ),
          });
          return;
        }
        const mint = raw.payload.mint?.trim();
        if (!mint) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Mint required"),
          });
          return;
        }
        try {
          const info = await fetchShieldBalanceInfo({
            network: p.network,
            rpcUrlOverride: p.rpcUrlOverride ?? null,
            ownerAddress: sessionKeypair.publicKey.toBase58(),
            mintAddress: mint,
          });
          sendResponse({ ok: true, payload: info });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({
            ok: false,
            error: walletError(4002, m),
          });
        }
        return;
      }

      case "GET_SHIELD_BALANCES_BATCH": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        if (!isShieldFeatureEnabled(p.network)) {
          sendResponse({ ok: true, payload: {} });
          return;
        }
        const rawMints = raw.payload.mints;
        const mints = Array.isArray(rawMints)
          ? [...new Set(rawMints.map((m) => String(m).trim()).filter((m) => m.length >= 32))].slice(
              0,
              48,
            )
          : [];
        const owner = sessionKeypair.publicKey.toBase58();
        try {
          const payload = await fetchShieldBalancesMapForMints({
            network: p.network,
            owner,
            mints,
            rpcUrlOverride: p.rpcUrlOverride ?? null,
          });
          await mergeShieldBalancesIntoCache({
            network: p.network,
            address: owner,
            patch: payload,
          });
          sendResponse({ ok: true, payload });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({
            ok: false,
            error: walletError(4002, m),
          });
        }
        return;
      }

      case "SHIELD_SPL": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        if (!isShieldFeatureEnabled(p.network)) {
          sendResponse({
            ok: false,
            error: walletError(
              4002,
              "Shield is only available on Devnet",
            ),
          });
          return;
        }
        const mint = raw.payload.mint?.trim();
        const amount = raw.payload.amount?.trim();
        const mode = raw.payload.mode;
        if (!mint || !amount || (mode !== "shield" && mode !== "unshield")) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Mint, amount, and mode required"),
          });
          return;
        }
        try {
          const { signature } =
            mode === "shield"
              ? await shieldSplToken({
                  network: p.network,
                  from: sessionKeypair,
                  mintAddress: mint,
                  amountStr: amount,
                  rpcUrlOverride: p.rpcUrlOverride ?? null,
                })
              : await unshieldSplToken({
                  network: p.network,
                  from: sessionKeypair,
                  mintAddress: mint,
                  amountStr: amount,
                  rpcUrlOverride: p.rpcUrlOverride ?? null,
                });
          await refreshWalletData({ forcePortfolio: true });
          const addr = sessionKeypair.publicKey.toBase58();
          await patchPortfolioTokenAmountFromRpcForMint({
            network: p.network,
            address: addr,
            mint,
            rpcUrlOverride: p.rpcUrlOverride ?? null,
          });
          try {
            const freshShield = await fetchShieldBalanceInfo({
              network: p.network,
              rpcUrlOverride: p.rpcUrlOverride ?? null,
              ownerAddress: addr,
              mintAddress: mint,
            });
            await mergeShieldBalancesIntoCache({
              network: p.network,
              address: addr,
              patch: { [mint]: freshShield.privateBalanceRaw },
            });
          } catch {
            // shield cache already refreshed in refreshWalletData
          }
          sendResponse({ ok: true, payload: { signature } });
        } catch (e) {
          const m = messageFromUnknown(e);
          sendResponse({
            ok: false,
            error: walletError(4002, m),
          });
        }
        return;
      }

      case "REQUEST_AIRDROP": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const sig = await requestAirdropDevnet(
          p.network,
          sessionKeypair.publicKey.toBase58(),
          1,
          p.rpcUrlOverride ?? null,
        );
        await refreshWalletData({ forcePortfolio: true });
        sendResponse({ ok: true, payload: { signature: sig } });
        return;
      }

      case "GET_ACTIVITY": {
        const p = await loadVault();
        let addr: string | null =
          sessionKeypair?.publicKey.toBase58() ?? null;
        if (!addr && p?.accounts?.length) {
          try {
            addr = getActiveAccountEntry(p).keystore.address;
          } catch {
            addr = null;
          }
        }
        if (!addr) {
          sendResponse({
            ok: true,
            payload: { items: [], network: p?.network ?? DEFAULT_NETWORK },
          });
          return;
        }
        const network = p?.network ?? DEFAULT_NETWORK;
        const rpcUrlOverride = p?.rpcUrlOverride ?? null;
        const limit = raw.payload?.limit ?? 20;
        const forceRefresh = raw.payload?.refresh === true;

        if (!forceRefresh) {
          const cachedAct = await readActivityCache(network, addr);
          if (cachedAct) {
            sendResponse({
              ok: true,
              payload: {
                ...cachedAct.payload,
                cachedAt: cachedAct.cachedAt,
              },
            });
            return;
          }
        }

        try {
          const data = await fetchBrumeActivity(
            network,
            addr,
            limit,
            rpcUrlOverride,
          );
          const now = Date.now();
          const stored = {
            items: data.items,
            network: data.network,
            source: (data.source ?? "api") as "rpc-enriched" | "helius" | "api",
          };
          await writeActivityCache(network, addr, stored);
          sendResponse({
            ok: true,
            payload: { ...stored, cachedAt: now },
          });
        } catch (e) {
          const errMsg = messageFromUnknown(e);
          const now = Date.now();
          const stored = {
            items: [],
            network,
            source: "api" as const,
            rpcError: errMsg,
          };
          await writeActivityCache(network, addr, stored);
          sendResponse({
            ok: true,
            payload: { ...stored, cachedAt: now },
          });
        }
        return;
      }

      case "LIST_CONNECTED_SITES": {
        const p = await loadVault();
        const active = p ? getActiveAccountEntry(p) : null;
        const sites = active?.connectedOrigins
          ? Object.entries(active.connectedOrigins).map(([origin, v]) => ({
              origin,
              publicKey: v.publicKey,
              connectedAt: v.connectedAt,
            }))
          : [];
        sendResponse({ ok: true, payload: { sites } });
        return;
      }

      case "DISCONNECT_SITE": {
        const p = await getVaultOrThrow();
        const active = getActiveAccountEntry(p);
        delete active.connectedOrigins[raw.payload.origin];
        await saveVault(p);
        sendResponse({ ok: true });
        return;
      }

      case "EXPORT_SECRET": {
        const p = await getVaultOrThrow();
        const active = getActiveAccountEntry(p);
        if (
          !raw.payload.password &&
          sessionKeypair &&
          sessionAccountId === p.activeAccountId &&
          sessionKeypair.publicKey.toBase58() === active.keystore.address
        ) {
          sendResponse({
            ok: true,
            payload: { secretKeyBase64: bytesToBase64(sessionKeypair.secretKey) },
          });
          return;
        }
        const pw = raw.payload.password ?? sessionVaultPassword;
        if (!pw) {
          sendResponse({
            ok: false,
            error: walletError(4002, "Unlock your wallet first"),
          });
          return;
        }
        try {
          const secret = await decryptSecretKey(pw, active.keystore);
          sendResponse({
            ok: true,
            payload: { secretKeyBase64: bytesToBase64(secret) },
          });
        } catch (e) {
          const wrongPw = isDecryptFailure(e);
          sendResponse({
            ok: false,
            error: walletError(
              WalletErrorCodes.WalletConnectionError,
              wrongPw ? "Incorrect password" : e instanceof Error ? e.message : "Export failed",
            ),
          });
        }
        return;
      }

      case "POPUP_APPROVE_CONNECT": {
        const p = await getVaultOrThrow();
        const active = getActiveAccountEntry(p);
        if (!pendingConnect || pendingConnect.id !== raw.payload.connectRequestId) {
          sendResponse({
            ok: false,
            error: walletError(4002, "No pending connect"),
          });
          return;
        }
        const pk =
          sessionKeypair?.publicKey.toBase58() ?? active.keystore.address;
        active.connectedOrigins[pendingConnect.origin] = {
          publicKey: pk,
          connectedAt: Date.now(),
        };
        await saveVault(p);
        const tabId = pendingConnect.tabId;
        const rid = pendingConnect.id;
        pendingConnect = null;
        updateBadge();
        await notifyTab(tabId, {
          type: "BRUME_RESOLVE",
          requestId: rid,
          ok: true,
          result: { publicKey: pk },
        });
        sendResponse({ ok: true });
        return;
      }

      case "POPUP_REJECT_CONNECT": {
        if (!pendingConnect || pendingConnect.id !== raw.payload.connectRequestId) {
          sendResponse({ ok: true });
          return;
        }
        const tabId = pendingConnect.tabId;
        const rid = pendingConnect.id;
        pendingConnect = null;
        updateBadge();
        await notifyTab(tabId, {
          type: "BRUME_RESOLVE",
          requestId: rid,
          ok: false,
          error: walletError(
            WalletErrorCodes.WalletUserRejected,
            "User rejected connection",
          ),
        });
        sendResponse({ ok: true });
        return;
      }

      case "POPUP_APPROVE_SIGN": {
        if (!sessionKeypair) {
          sendResponse({
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Locked"),
          });
          return;
        }
        const item = signQueue.removeById(raw.payload.approvalId);
        if (!item) {
          sendResponse({
            ok: false,
            error: walletError(4002, "No pending signature"),
          });
          return;
        }
        updateBadge();
        try {
          if (item.kind === "transaction" && item.serializedTransaction) {
            const signed = await signTransactionBytes(
              base64ToBytes(item.serializedTransaction),
              sessionKeypair,
            );
            await notifyTab(item.tabId, {
              type: "BRUME_RESOLVE",
              requestId: item.dappRequestId,
              ok: true,
              result: { signedTransaction: bytesToBase64(signed) },
            });
          } else if (
            item.kind === "allTransactions" &&
            item.serializedTransactions
          ) {
            const signedList = await signAllTransactionBytes(
              item.serializedTransactions.map((s) => base64ToBytes(s)),
              sessionKeypair,
            );
            await notifyTab(item.tabId, {
              type: "BRUME_RESOLVE",
              requestId: item.dappRequestId,
              ok: true,
              result: {
                signedTransactions: signedList.map((b) => bytesToBase64(b)),
              },
            });
          } else if (item.kind === "message" && item.message) {
            const sig = signMessageBytes(
              base64ToBytes(item.message),
              sessionKeypair,
            );
            await notifyTab(item.tabId, {
              type: "BRUME_RESOLVE",
              requestId: item.dappRequestId,
              ok: true,
              result: { signature: bytesToBase64(sig) },
            });
          } else {
            throw new Error("Invalid pending sign payload");
          }
        } catch (e) {
          await notifyTab(item.tabId, {
            type: "BRUME_RESOLVE",
            requestId: item.dappRequestId,
            ok: false,
            error: walletError(
              WalletErrorCodes.WalletSignTransactionError,
              String(e),
            ),
          });
        }
        sendResponse({ ok: true });
        return;
      }

      case "POPUP_REJECT_SIGN": {
        const item = signQueue.removeById(raw.payload.approvalId);
        if (item) {
          updateBadge();
          await notifyTab(item.tabId, {
            type: "BRUME_RESOLVE",
            requestId: item.dappRequestId,
            ok: false,
            error: walletError(
              WalletErrorCodes.WalletUserRejected,
              "User rejected signature",
            ),
          });
        }
        sendResponse({ ok: true });
        return;
      }

      case "DAPP_CONNECT": {
        let tabId: number;
        let origin: string;
        try {
          ({ tabId, origin } = requireTabContext(sender));
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "No tab context"),
          });
          return;
        }
        const p = await loadVault();
        if (!p?.accounts?.length) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(
              WalletErrorCodes.WalletNotReady,
              "Wallet not initialized",
            ),
          });
          sendResponse({ ok: true });
          return;
        }
        const decision = validateOrigin(origin, p.allowlist, p.blocklist);
        if (decision === "blocked") {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(4002, "Origin blocked"),
          });
          sendResponse({ ok: true });
          return;
        }
        const active = getActiveAccountEntry(p);
        const pk =
          sessionKeypair?.publicKey.toBase58() ?? active.keystore.address;
        const existing = active.connectedOrigins[origin];
        if (existing) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: true,
            result: { publicKey: existing.publicKey },
          });
          sendResponse({ ok: true });
          return;
        }
        if (decision === "allowed") {
          active.connectedOrigins[origin] = {
            publicKey: pk,
            connectedAt: Date.now(),
          };
          await saveVault(p);
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: true,
            result: { publicKey: pk },
          });
          sendResponse({ ok: true });
          return;
        }
        pendingConnect = {
          id: raw.requestId,
          origin,
          tabId,
        };
        updateBadge();
        sendResponse({ ok: true });
        return;
      }

      case "DAPP_DISCONNECT": {
        let tabId: number;
        let origin: string;
        try {
          ({ tabId, origin } = requireTabContext(sender));
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "No tab context"),
          });
          return;
        }
        const p = await loadVault();
        if (p?.accounts?.length) {
          try {
            const active = getActiveAccountEntry(p);
            if (active.connectedOrigins[origin]) {
              delete active.connectedOrigins[origin];
              await saveVault(p);
            }
          } catch {
            // No active account; nothing to disconnect for this origin.
          }
        }
        await notifyTab(tabId, {
          type: "BRUME_RESOLVE",
          requestId: raw.requestId,
          ok: true,
          result: null,
        });
        sendResponse({ ok: true });
        return;
      }

      case "DAPP_GET_ACCOUNTS": {
        let tabId: number;
        let origin: string;
        try {
          ({ tabId, origin } = requireTabContext(sender));
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "No tab context"),
          });
          return;
        }
        const p = await loadVault();
        let conn: { publicKey: string; connectedAt: number } | undefined;
        if (p?.accounts?.length) {
          try {
            conn = getActiveAccountEntry(p).connectedOrigins[origin];
          } catch {
            conn = undefined;
          }
        }
        if (conn) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: true,
            result: { accounts: [conn.publicKey] },
          });
        } else {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: true,
            result: { accounts: [] },
          });
        }
        sendResponse({ ok: true });
        return;
      }

      case "DAPP_SIGN_TRANSACTION": {
        let tabId: number;
        let origin: string;
        try {
          ({ tabId, origin } = requireTabContext(sender));
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "No tab context"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const active = getActiveAccountEntry(p);
        if (!sessionKeypair) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Wallet locked"),
          });
          sendResponse({ ok: true });
          return;
        }
        if (!active.connectedOrigins[origin]) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(4002, "Not connected"),
          });
          sendResponse({ ok: true });
          return;
        }
        const approvalId = crypto.randomUUID();
        signQueue.enqueue({
          id: approvalId,
          dappRequestId: raw.requestId,
          kind: "transaction",
          origin,
          tabId,
          serializedTransaction: raw.payload.serializedTransaction,
        });
        updateBadge();
        sendResponse({ ok: true });
        return;
      }

      case "DAPP_SIGN_ALL_TRANSACTIONS": {
        let tabId: number;
        let origin: string;
        try {
          ({ tabId, origin } = requireTabContext(sender));
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "No tab context"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const active = getActiveAccountEntry(p);
        if (!sessionKeypair) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Wallet locked"),
          });
          sendResponse({ ok: true });
          return;
        }
        if (!active.connectedOrigins[origin]) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(4002, "Not connected"),
          });
          sendResponse({ ok: true });
          return;
        }
        const approvalId = crypto.randomUUID();
        signQueue.enqueue({
          id: approvalId,
          dappRequestId: raw.requestId,
          kind: "allTransactions",
          origin,
          tabId,
          serializedTransactions: raw.payload.serializedTransactions,
        });
        updateBadge();
        sendResponse({ ok: true });
        return;
      }

      case "DAPP_SIGN_MESSAGE": {
        let tabId: number;
        let origin: string;
        try {
          ({ tabId, origin } = requireTabContext(sender));
        } catch {
          sendResponse({
            ok: false,
            error: walletError(4002, "No tab context"),
          });
          return;
        }
        const p = await getVaultOrThrow();
        const active = getActiveAccountEntry(p);
        if (!sessionKeypair) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(WalletErrorCodes.WalletNotReady, "Wallet locked"),
          });
          sendResponse({ ok: true });
          return;
        }
        if (!active.connectedOrigins[origin]) {
          await notifyTab(tabId, {
            type: "BRUME_RESOLVE",
            requestId: raw.requestId,
            ok: false,
            error: walletError(4002, "Not connected"),
          });
          sendResponse({ ok: true });
          return;
        }
        const approvalId = crypto.randomUUID();
        signQueue.enqueue({
          id: approvalId,
          dappRequestId: raw.requestId,
          kind: "message",
          origin,
          tabId,
          message: raw.payload.message,
        });
        updateBadge();
        sendResponse({ ok: true });
        return;
      }

      default:
        sendResponse({
          ok: false,
          error: walletError(4002, `Unknown message: ${(raw as { type: string }).type}`),
        });
    }
  } catch (e) {
    sendResponse({
      ok: false,
      error: walletError(
        4002,
        e instanceof Error ? e.message : "Unknown error",
      ),
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message as ExtensionMessage, sender, sendResponse);
  return true;
});

void chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  void loadAndApplyUiSurface();
});

chrome.runtime.onStartup.addListener(() => {
  void loadAndApplyUiSurface();
});
