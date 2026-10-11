import { NextResponse } from "next/server";
import { defaultRpcUrl, proxyRpcUrl } from "@/lib/rpc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 4000;

type Check = { ok: boolean; ms: number; error?: string };

// One cheap RPC call per upstream the wallet depends on. URLs stay server-side:
// the Helius URL carries the API key.
async function checkRpc(url: string): Promise<Check> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { result?: unknown } | null;
    const ok = res.ok && typeof body?.result === "number";
    return { ok, ms: Date.now() - started, ...(ok ? {} : { error: `HTTP ${res.status}` }) };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, ms: Date.now() - started, error: timedOut ? "timeout" : "unreachable" };
  }
}

// 200 when every upstream answers, 503 otherwise, so an uptime monitor can alert on status alone.
export async function GET() {
  const [mainnetRpc, devnetRpc] = await Promise.all([
    checkRpc(proxyRpcUrl("mainnet-beta")),
    checkRpc(defaultRpcUrl("devnet")),
  ]);
  const checks = { mainnetRpc, devnetRpc };
  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok, service: "brume-api", ts: new Date().toISOString(), checks },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
