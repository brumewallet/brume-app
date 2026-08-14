// cluster = devnet | mainnet, or a custom base-layer RPC URL string.
import {
  normalizeInitializeMintUnsigned,
  normalizeUnsignedPaymentTransaction,
  type InitializeMintUnsigned,
  type UnsignedPaymentTransaction,
} from "@brume/shared";
import {
  MAGICBLOCK_PAYMENTS_API_BASE_URL,
  paymentsClusterForNetwork,
  type NetworkId,
} from "@/shared/constants";

const API_BASE = MAGICBLOCK_PAYMENTS_API_BASE_URL.replace(/\/+$/, "");

export type { InitializeMintUnsigned, UnsignedPaymentTransaction };

function paymentsApiErrorToMessage(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (typeof error === "string") return error.trim() || undefined;
  if (typeof error !== "object") return String(error);
  const o = error as Record<string, unknown>;
  const msg = o.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  const issues = o.issues;
  if (Array.isArray(issues)) {
    const parts = issues
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const m = (item as { message?: unknown }).message;
        return typeof m === "string" ? m : null;
      })
      .filter((s): s is string => !!s);
    if (parts.length) return parts.join("; ");
  }
  try {
    const s = JSON.stringify(error);
    return s !== "{}" ? s : undefined;
  } catch {
    return undefined;
  }
}

function clusterForRequest(
  network: NetworkId,
  rpcUrlOverride?: string | null,
): string {
  const o = rpcUrlOverride?.trim();
  if (o) return o;
  return paymentsClusterForNetwork(network);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Payments API: invalid JSON (HTTP ${res.status})`);
  }
  if (!res.ok) {
    const rec = data as { error?: unknown };
    const msg =
      paymentsApiErrorToMessage(rec.error) ??
      `Payments API error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function paymentsGetIsMintInitialized(
  mint: string,
  network: NetworkId,
  rpcUrlOverride?: string | null,
  validator?: string,
): Promise<boolean> {
  const q = new URLSearchParams({
    mint: mint.trim(),
    cluster: clusterForRequest(network, rpcUrlOverride),
  });
  if (validator) q.set("validator", validator);
  const res = await fetch(`${API_BASE}/v1/spl/is-mint-initialized?${q}`);
  const data = (await readJson(res)) as { initialized?: boolean };
  return !!data.initialized;
}

export async function paymentsGetSplBalance(
  address: string,
  mint: string,
  network: NetworkId,
  rpcUrlOverride?: string | null,
): Promise<string> {
  const q = new URLSearchParams({
    address: address.trim(),
    mint: mint.trim(),
    cluster: clusterForRequest(network, rpcUrlOverride),
  });
  const res = await fetch(`${API_BASE}/v1/spl/balance?${q}`);
  const data = (await readJson(res)) as { balance?: string };
  if (typeof data.balance !== "string") throw new Error("Invalid balance response");
  return data.balance;
}

export async function paymentsGetPrivateBalance(
  address: string,
  mint: string,
  network: NetworkId,
  rpcUrlOverride?: string | null,
): Promise<string> {
  const q = new URLSearchParams({
    address: address.trim(),
    mint: mint.trim(),
    cluster: clusterForRequest(network, rpcUrlOverride),
  });
  const res = await fetch(`${API_BASE}/v1/spl/private-balance?${q}`);
  const data = (await readJson(res)) as { balance?: string };
  if (typeof data.balance !== "string") throw new Error("Invalid private balance response");
  return data.balance;
}

export async function paymentsPostInitializeMint(params: {
  payer: string;
  mint: string;
  network: NetworkId;
  rpcUrlOverride?: string | null;
  validator?: string;
}): Promise<InitializeMintUnsigned> {
  const body: Record<string, unknown> = {
    payer: params.payer.trim(),
    mint: params.mint.trim(),
    cluster: clusterForRequest(params.network, params.rpcUrlOverride),
  };
  if (params.validator) body.validator = params.validator;
  const res = await fetch(`${API_BASE}/v1/spl/initialize-mint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await readJson(res);
  return normalizeInitializeMintUnsigned(raw);
}

export async function paymentsPostSplDeposit(params: {
  owner: string;
  mint: string;
  amount: number;
  network: NetworkId;
  rpcUrlOverride?: string | null;
  validator?: string;
}): Promise<UnsignedPaymentTransaction> {
  const body: Record<string, unknown> = {
    owner: params.owner.trim(),
    mint: params.mint.trim(),
    amount: params.amount,
    cluster: clusterForRequest(params.network, params.rpcUrlOverride),
    initIfMissing: true,
    initVaultIfMissing: true,
    initAtasIfMissing: true,
    idempotent: true,
  };
  if (params.validator) body.validator = params.validator;
  const res = await fetch(`${API_BASE}/v1/spl/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await readJson(res);
  return normalizeUnsignedPaymentTransaction(raw);
}

export async function paymentsPostSplWithdraw(params: {
  owner: string;
  mint: string;
  amount: number;
  network: NetworkId;
  rpcUrlOverride?: string | null;
  validator?: string;
}): Promise<UnsignedPaymentTransaction> {
  const body: Record<string, unknown> = {
    owner: params.owner.trim(),
    mint: params.mint.trim(),
    amount: params.amount,
    cluster: clusterForRequest(params.network, params.rpcUrlOverride),
    idempotent: true,
  };
  if (params.validator) body.validator = params.validator;
  const res = await fetch(`${API_BASE}/v1/spl/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await readJson(res);
  return normalizeUnsignedPaymentTransaction(raw);
}

export async function paymentsPostSplTransfer(params: {
  from: string;
  to: string;
  mint: string;
  amount: number;
  visibility: "public" | "private";
  fromBalance: "base" | "ephemeral";
  toBalance: "base" | "ephemeral";
  network: NetworkId;
  rpcUrlOverride?: string | null;
  validator?: string;
}): Promise<UnsignedPaymentTransaction> {
  const body: Record<string, unknown> = {
    from: params.from.trim(),
    to: params.to.trim(),
    mint: params.mint.trim(),
    amount: params.amount,
    visibility: params.visibility,
    fromBalance: params.fromBalance,
    toBalance: params.toBalance,
    cluster: clusterForRequest(params.network, params.rpcUrlOverride),
    initIfMissing: true,
    initAtasIfMissing: true,
    initVaultIfMissing: true,
  };
  if (params.validator) body.validator = params.validator;
  const res = await fetch(`${API_BASE}/v1/spl/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await readJson(res);
  return normalizeUnsignedPaymentTransaction(raw);
}
