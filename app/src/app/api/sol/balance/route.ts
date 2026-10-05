import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { defaultRpcUrl, networkFromParam } from "@/lib/rpc";


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const network = networkFromParam(searchParams.get("network"));
  const rpcUrl = searchParams.get("rpcUrl") ?? defaultRpcUrl(network);

  if (!owner) {
    return NextResponse.json({ error: "owner is required" }, { status: 400 });
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "Invalid owner address" }, { status: 400 });
  }

  try {
    const conn = new Connection(rpcUrl, "confirmed");
    const lamports = await conn.getBalance(pubkey);
    return NextResponse.json({ lamports: String(lamports) });
  } catch (err) {
    console.error("[api/sol/balance]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RPC error" },
      { status: 502 },
    );
  }
}
