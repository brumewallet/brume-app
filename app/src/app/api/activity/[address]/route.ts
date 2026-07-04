import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const RPC: Record<string, string> = {
  devnet: "https://rpc.magicblock.app/devnet",
  "mainnet-beta": "https://rpc.magicblock.app/mainnet",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") ?? "devnet";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const rpcUrl = searchParams.get("rpcUrl") ?? RPC[network] ?? RPC["devnet"];

  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(address);
  } catch {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const conn = new Connection(rpcUrl, "confirmed");
    const signatures = await conn.getSignaturesForAddress(pubkey, { limit });

    const items = signatures.map((sig) => ({
      signature: sig.signature,
      slot: sig.slot,
      blockTime: sig.blockTime ?? null,
      err: sig.err ?? null,
      memo: sig.memo ?? null,
    }));

    return NextResponse.json({ items, network, source: "rpc" });
  } catch (err) {
    console.error("[api/activity]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RPC error" },
      { status: 502 },
    );
  }
}
