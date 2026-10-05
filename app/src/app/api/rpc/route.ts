import { NextResponse } from "next/server";
import { clientIp, createRateLimiter, type RateLimitResult } from "@/lib/rate-limit";
import { networkFromParam, proxyRpcUrl } from "@/lib/rpc";

export const dynamic = "force-dynamic";

// Call units per IP per minute; each batch entry costs its method weight. Confirmation polling uses about 120 per minute.
const RPC_CALLS_PER_MINUTE = Number(process.env.RPC_PROXY_CALLS_PER_MINUTE) || 300;
const takeRpcCalls = createRateLimiter(RPC_CALLS_PER_MINUTE, 60_000);

// Heavy upstream methods cost more units; any method not listed costs 1.
const METHOD_COST: Record<string, number> = {
  getProgramAccounts: 10,
};

// JSON-RPC methods the wallet and its SDKs send (web3.js wire names); everything else is refused.
const ALLOWED_METHODS = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getBlockTime",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getTransaction",
  "sendTransaction",
  "simulateTransaction",
]);

// First method in the request that is missing or not on the allowlist.
function disallowedMethod(entries: unknown[]): string | null {
  for (const e of entries) {
    const method = (e as { method?: unknown } | null)?.method;
    if (typeof method !== "string") return "(missing)";
    if (!ALLOWED_METHODS.has(method)) return method;
  }
  return null;
}

function rpcError(code: number, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers });
}

function limitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-limit": String(r.limit),
    "x-ratelimit-remaining": String(r.remaining),
    "x-ratelimit-reset": String(Math.ceil(r.resetMs / 1000)),
  };
}

// JSON-RPC pass-through for the extension; public mainnet RPC rejects browser origins with 403.
export async function POST(request: Request) {
  const network = networkFromParam(new URL(request.url).searchParams.get("network"));
  const body = await request.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return rpcError(-32700, "Parse error", 400);
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  if (entries.length === 0) return rpcError(-32600, "Invalid request", 400);
  const blocked = disallowedMethod(entries);
  if (blocked) return rpcError(-32601, `Method not allowed by Brume RPC proxy: ${blocked}`, 403);
  const cost = entries.reduce((sum: number, e) => sum + (METHOD_COST[(e as { method: string }).method] ?? 1), 0);

  const limit = takeRpcCalls(clientIp(request), cost);
  if (!limit.ok) {
    return rpcError(429, "Too many requests", 429, {
      ...limitHeaders(limit),
      "retry-after": String(Math.ceil(limit.resetMs / 1000)),
    });
  }

  try {
    const upstream = await fetch(proxyRpcUrl(network), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    return new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        ...limitHeaders(limit),
      },
    });
  } catch (err) {
    console.error("[api/rpc]", err);
    return rpcError(-32603, "Upstream RPC unreachable", 502);
  }
}
