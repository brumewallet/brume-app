import type { ExplorerId } from "@/shared/constants";
import type { ExtensionMessage, WalletUiState } from "@/shared/types";

type BgResponse =
  | { ok: true; payload?: unknown }
  | { ok: false; error: { code: number; message: string } };

function sendMessage<T>(msg: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res: BgResponse) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!res) {
        reject(new Error("No response"));
        return;
      }
      if (!res.ok) {
        const raw = res.error.message;
        const text =
          typeof raw === "string" && raw.trim()
            ? raw
            : raw != null && typeof raw === "object"
              ? JSON.stringify(raw)
              : String(raw ?? "Unknown error");
        const e = new Error(text) as Error & { code?: number };
        e.code = res.error.code;
        reject(e);
        return;
      }
      resolve(res.payload as T);
    });
  });
}

export function getState(): Promise<WalletUiState> {
  const requestId = crypto.randomUUID();
  return sendMessage<WalletUiState>({ type: "GET_STATE", requestId });
}

export function activityHeartbeat(): Promise<void> {
  const requestId = crypto.randomUUID();
  return sendMessage<void>({ type: "ACTIVITY_HEARTBEAT", requestId });
}

export function getAutoLockTimeout(): Promise<{ minutes: number }> {
  const requestId = crypto.randomUUID();
  return sendMessage<{ minutes: number }>({ type: "GET_AUTO_LOCK_TIMEOUT", requestId });
}

export function setAutoLockTimeout(minutes: number): Promise<{ minutes: number }> {
  const requestId = crypto.randomUUID();
  return sendMessage<{ minutes: number }>({
    type: "SET_AUTO_LOCK_TIMEOUT",
    requestId,
    payload: { minutes },
  });
}

export function createWallet(mnemonic: string, password?: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ publicKey: string }>({
    type: "CREATE_WALLET",
    requestId,
    payload:
      password !== undefined ? { mnemonic, password } : { mnemonic },
  });
}

export function importWallet(mnemonic: string, password?: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ publicKey: string }>({
    type: "IMPORT_WALLET",
    requestId,
    payload:
      password !== undefined ? { mnemonic, password } : { mnemonic },
  });
}

export function importPrivateKey(secretKeyInput: string, password?: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ publicKey: string }>({
    type: "IMPORT_PRIVATE_KEY",
    requestId,
    payload:
      password !== undefined
        ? { secretKeyInput, password }
        : { secretKeyInput },
  });
}

export function addHdAccount() {
  const requestId = crypto.randomUUID();
  return sendMessage<{ publicKey: string }>({
    type: "ADD_HD_ACCOUNT",
    requestId,
    payload: {},
  });
}

export function unlock(password: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ publicKey: string }>({
    type: "UNLOCK",
    requestId,
    payload: { password },
  });
}

export function switchAccount(accountId: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ publicKey: string }>({
    type: "SWITCH_ACCOUNT",
    requestId,
    payload: { accountId },
  });
}

export function renameAccount(accountId: string, label: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "RENAME_ACCOUNT",
    requestId,
    payload: { accountId, label },
  });
}

export function removeAccount(accountId: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "REMOVE_ACCOUNT",
    requestId,
    payload: { accountId },
  });
}

export function lockWallet() {
  const requestId = crypto.randomUUID();
  return sendMessage({ type: "LOCK", requestId });
}

export function setNetwork(network: import("@/shared/constants").NetworkId) {
  const requestId = crypto.randomUUID();
  return sendMessage({ type: "SET_NETWORK", requestId, payload: { network } });
}

export function setSimpleMode(simpleMode: boolean) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "SET_SIMPLE_MODE",
    requestId,
    payload: { simpleMode },
  });
}

export function setRpcUrlOverride(rpcUrl: string | null) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ rpcUrl: string | null }>({
    type: "SET_RPC_URL_OVERRIDE",
    requestId,
    payload: { rpcUrl },
  });
}

export function setExplorerId(explorerId: ExplorerId) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ explorerId: ExplorerId }>({
    type: "SET_EXPLORER_ID",
    requestId,
    payload: { explorerId },
  });
}

export function setUiSurface(surface: "popup" | "sidepanel") {
  const requestId = crypto.randomUUID();
  return sendMessage<{ surface: "popup" | "sidepanel" }>({
    type: "SET_UI_SURFACE",
    requestId,
    payload: { surface },
  });
}

export function refreshBalanceFromChain() {
  const requestId = crypto.randomUUID();
  return sendMessage({ type: "REFRESH_BALANCE", requestId });
}

export function sendSol(to: string, sol: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{
    signature: string;
    solSendRoute: "private" | "standard";
  }>({
    type: "SEND_SOL",
    requestId,
    payload: { to, sol },
  });
}

export function sendSpl(
  mint: string,
  to: string,
  amount: string,
  opts?: { fromPrivateBalance?: boolean },
) {
  const requestId = crypto.randomUUID();
  return sendMessage<{
    signature: string;
    splSendRoute: "private" | "standard";
  }>({
    type: "SEND_SPL",
    requestId,
    payload: {
      mint,
      to,
      amount,
      ...(opts?.fromPrivateBalance === true
        ? { fromPrivateBalance: true }
        : {}),
    },
  });
}

export function burnSpl(mint: string, amount: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ signature: string }>({
    type: "BURN_SPL",
    requestId,
    payload: { mint, amount },
  });
}

export function wrapSol(amountSol: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ signature: string }>({
    type: "WRAP_SOL",
    requestId,
    payload: { amountSol },
  });
}

export function unwrapSol() {
  const requestId = crypto.randomUUID();
  return sendMessage<{ signature: string }>({
    type: "UNWRAP_SOL",
    requestId,
    payload: {} as Record<string, never>,
  });
}

export function getNfts(refresh = false) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ nfts: import("@/background/api-client").NftItem[]; cached?: boolean; cachedAt?: number }>({
    type: "GET_NFTS",
    requestId,
    payload: { refresh },
  });
}

export function burnNft(mint: string, collection: string | null, standard: "mpl-core" | "legacy" | "programmable") {
  const requestId = crypto.randomUUID();
  return sendMessage<{ signature: string }>({
    type: "BURN_NFT",
    requestId,
    payload: { mint, collection, standard },
  });
}

export function getShieldBalances(mint: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{
    decimals: number;
    baseBalanceRaw: string;
    privateBalanceRaw: string;
  }>({
    type: "GET_SHIELD_BALANCES",
    requestId,
    payload: { mint },
  });
}

export function getShieldBalancesBatch(mints: string[]) {
  const requestId = crypto.randomUUID();
  return sendMessage<Record<string, string>>({
    type: "GET_SHIELD_BALANCES_BATCH",
    requestId,
    payload: { mints },
  });
}

export function shieldSpl(
  mode: "shield" | "unshield",
  mint: string,
  amount: string,
) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ signature: string }>({
    type: "SHIELD_SPL",
    requestId,
    payload: { mode, mint, amount },
  });
}

export function requestAirdrop() {
  const requestId = crypto.randomUUID();
  return sendMessage<{ signature: string }>({
    type: "REQUEST_AIRDROP",
    requestId,
  });
}

export function getActivity(limit?: number, refresh?: boolean) {
  const requestId = crypto.randomUUID();
  return sendMessage<{
    items: Array<{
      signature: string;
      slot: number | null;
      err: unknown;
      blockTime: number | null;
      summary?: string;
      txType?: string | null;
      source?: string | null;
      displayLabel?: string;
      displayDetail?: string;
      activityIcons?: Array<{
        kind: "sol" | "token";
        mint?: string;
        logoUri: string | null;
      }>;
    }>;
    network: import("@/shared/constants").NetworkId;
    rpcError?: string;
    source?: "rpc-enriched";
    cachedAt?: number;
  }>({
    type: "GET_ACTIVITY",
    requestId,
    payload: { limit, refresh },
  });
}

export function listConnectedSites() {
  const requestId = crypto.randomUUID();
  return sendMessage<{
    sites: Array<{
      origin: string;
      publicKey: string;
      connectedAt: number;
    }>;
  }>({ type: "LIST_CONNECTED_SITES", requestId });
}

export function disconnectSite(origin: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "DISCONNECT_SITE",
    requestId,
    payload: { origin },
  });
}

export function exportSecret(password?: string) {
  const requestId = crypto.randomUUID();
  return sendMessage<{ secretKeyBase64: string }>({
    type: "EXPORT_SECRET",
    requestId,
    payload: password !== undefined ? { password } : {},
  });
}

export function approveConnect(connectRequestId: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "POPUP_APPROVE_CONNECT",
    requestId,
    payload: { connectRequestId },
  });
}

export function rejectConnect(connectRequestId: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "POPUP_REJECT_CONNECT",
    requestId,
    payload: { connectRequestId },
  });
}

export function approveSign(approvalId: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "POPUP_APPROVE_SIGN",
    requestId,
    payload: { approvalId },
  });
}

export function rejectSign(approvalId: string) {
  const requestId = crypto.randomUUID();
  return sendMessage({
    type: "POPUP_REJECT_SIGN",
    requestId,
    payload: { approvalId },
  });
}
