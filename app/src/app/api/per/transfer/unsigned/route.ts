import { NextResponse } from "next/server";

// through the Next.js app so it doesn't have to embed PER credentials.
const PER_DEVNET = "https://devnet-as.magicblock.app";
const PER_MAINNET = "https://tee.magicblock.app";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { network, from, to, mint, amount } = body as Record<string, unknown>;
  if (!from || !to || !mint || amount == null) {
    return NextResponse.json(
      { error: "from, to, mint, amount are required" },
      { status: 400 },
    );
  }

  const base = network === "mainnet-beta" ? PER_MAINNET : PER_DEVNET;

  try {
    const res = await fetch(`${base}/api/per/transfer/unsigned`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { error: `Upstream non-JSON response (HTTP ${res.status})` },
        { status: 502 },
      );
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[api/per/transfer/unsigned]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 },
    );
  }
}
