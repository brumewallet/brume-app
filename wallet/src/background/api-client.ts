import { DEFAULT_BRUME_API_ORIGIN } from "@/shared/constants";
import type { NetworkId } from "@/shared/constants";
import {
  normalizeUnsignedPaymentTransaction,
  type PortfolioTokenRow,
  type UnsignedPaymentTransaction,
} from "@brume/shared";

export function getBrumeApiOrigin(): string {
  return DEFAULT_BRUME_API_ORIGIN.replace(/\/$/, "");
}

function buildUrl(
  origin: string,
  path: string,
  params: Record<string, string | undefined>,
): string {
  const u = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") u.searchParams.set(k, v);
  }
  return u.toString();
}

export interface PortfolioApiResponse {
  tokens: PortfolioTokenRow[];
  nativeLamports: string | null;
  cached?: boolean;
}

export async function fetchBrumeSolBalance(
  network: NetworkId,
  owner: string,
  rpcUrlOverride: string | null,
): Promise<string> {
  const origin = getBrumeApiOrigin();
  const url = buildUrl(origin, "/api/sol/balance", {
    owner,
    network,
    rpcUrl: rpcUrlOverride ?? undefined,
  });
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brume API ${res.status}${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  const body = (await res.json()) as { lamports?: string; error?: string };
  if (body.lamports == null || body.lamports === "") {
    throw new Error(body.error ?? "Missing lamports in balance response");
  }
  return body.lamports;
}

export async function fetchBrumePortfolio(
  network: NetworkId,
  owner: string,
  rpcUrlOverride: string | null,
): Promise<PortfolioApiResponse> {
  const origin = getBrumeApiOrigin();
  const url = buildUrl(origin, "/api/tokens/portfolio", {
    owner,
    network,
    rpcUrl: rpcUrlOverride ?? undefined,
  });
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brume API ${res.status}${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as PortfolioApiResponse;
}

export interface ActivityApiResponse {
  items: unknown[];
  network: NetworkId;
  source?: string;
  cached?: boolean;
}

export async function fetchBrumeActivity(
  network: NetworkId,
  address: string,
  limit: number,
  rpcUrlOverride: string | null,
): Promise<ActivityApiResponse> {
  const origin = getBrumeApiOrigin();
  const url = buildUrl(origin, `/api/activity/${encodeURIComponent(address)}`, {
    network,
    limit: String(limit),
    rpcUrl: rpcUrlOverride ?? undefined,
  });
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brume API ${res.status}${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as ActivityApiResponse;
}

export type TokenMetadataApiResponse = {
  name: string;
  symbol: string;
  logoUri: string | null;
  metadataUri: string | null;
  decimals: number | null;
};

export async function fetchBrumeTokenMetadata(
  network: NetworkId,
  mint: string,
  rpcUrlOverride: string | null,
): Promise<TokenMetadataApiResponse> {
  const origin = getBrumeApiOrigin();
  const url = buildUrl(
    origin,
    `/api/tokens/metadata/${encodeURIComponent(mint)}`,
    {
      network,
      rpcUrl: rpcUrlOverride ?? undefined,
    },
  );
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brume API ${res.status}${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as TokenMetadataApiResponse;
}

// page - callers should fall back to Payments API directly.

export async function fetchBrumePerTransferUnsigned(params: {
  from: string;
  to: string;
  mint: string;
  amount: number;
  network: NetworkId;
  rpcUrlOverride: string | null;
}): Promise<UnsignedPaymentTransaction | null> {
  const origin = getBrumeApiOrigin();
  const url = `${origin}/api/per/transfer/unsigned`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      mint: params.mint,
      amount: params.amount,
      network: params.network,
      ...(params.rpcUrlOverride ? { rpcUrl: params.rpcUrlOverride } : {}),
    }),
  });

  const text = await res.text();

  if (res.status === 404) {
    return null;
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!res.ok) {
      return null;
    }
    throw new Error(`Brume API: expected JSON (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const err = (data as { error?: string }).error;
    if (typeof err === "string" && err.trim()) {
      throw new Error(err.trim());
    }
    return null;
  }

  return normalizeUnsignedPaymentTransaction(data);
}

export type NftItem = {
  mint: string;
  name: string;
  image: string | null;
  collection: string | null;
  collectionName: string | null;
  standard: "mpl-core" | "legacy" | "programmable";
  frozen: boolean;
};

export async function fetchBrumeNfts(
  network: NetworkId,
  owner: string,
  rpcUrlOverride: string | null,
): Promise<{ nfts: NftItem[]; hint?: string }> {
  const origin = getBrumeApiOrigin();
  const url = buildUrl(origin, "/api/nfts", {
    owner,
    network,
    rpcUrl: rpcUrlOverride ?? undefined,
  });
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Brume API ${res.status}${t ? `: ${t.slice(0, 160)}` : ""}`);
  }
  return (await res.json()) as { nfts: NftItem[]; hint?: string };
}
