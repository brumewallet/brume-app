import { Connection, PublicKey } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

const RPC: Record<string, string> = {
  devnet: "https://rpc.magicblock.app/devnet",
  "mainnet-beta": "https://rpc.magicblock.app/mainnet",
};

type TokenMeta = { symbol: string; name: string; logoURI?: string; decimals: number };

function buildLocalMap(): Map<string, TokenMeta> {
  try {
    const listPath = path.join(
      process.cwd(),
      "..",
      "wallet",
      "token-list",
      "src",
      "tokens",
      "solana.tokenlist.json",
    );
    const raw = fs.readFileSync(listPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      tokens: Array<{ address: string; symbol: string; name: string; logoURI?: string; decimals: number }>;
    };
    return new Map(parsed.tokens.map((t) => [t.address, { symbol: t.symbol, name: t.name, logoURI: t.logoURI, decimals: t.decimals }]));
  } catch {
    return new Map();
  }
}

const LOCAL_MAP = buildLocalMap();

let jupCache: Map<string, TokenMeta> | null = null;
let jupCacheExpiry = 0;

async function getTokenMap(): Promise<Map<string, TokenMeta>> {
  if (jupCache && Date.now() < jupCacheExpiry) return jupCache;
  try {
    const res = await fetch("https://token.jup.ag/all", {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const tokens = (await res.json()) as Array<{
        address: string; symbol: string; name: string; logoURI?: string; decimals: number;
      }>;
      const merged = new Map<string, TokenMeta>(LOCAL_MAP);
      for (const t of tokens) {
        merged.set(t.address, { symbol: t.symbol, name: t.name, logoURI: t.logoURI, decimals: t.decimals });
      }
      jupCache = merged;
      jupCacheExpiry = Date.now() + 3_600_000;
      return jupCache;
    }
  } catch {
  }
  return LOCAL_MAP;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const network = searchParams.get("network") ?? "devnet";
  const rpcUrl = searchParams.get("rpcUrl") ?? RPC[network] ?? RPC["devnet"];

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

    const [nativeLamports, tokenAccounts, tokenMap] = await Promise.all([
      conn.getBalance(pubkey),
      conn.getParsedTokenAccountsByOwner(pubkey, {
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      }),
      getTokenMap(),
    ]);

    const tokens = tokenAccounts.value
      .map((acc) => {
        const info = acc.account.data.parsed?.info;
        if (!info) return null;
        const mint: string = info.mint;
        const decimals: number = info.tokenAmount?.decimals ?? 9;
        const amountRaw: string = info.tokenAmount?.amount ?? "0";
        if (amountRaw === "0") return null;

        const meta = tokenMap.get(mint);
        return {
          mint,
          symbol: meta?.symbol ?? mint.slice(0, 6),
          name: meta?.name ?? mint.slice(0, 6),
          decimals: meta?.decimals ?? decimals,
          amountRaw,
          logoUri: meta?.logoURI ?? null,
          verified: meta != null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      tokens,
      nativeLamports: String(nativeLamports),
    });
  } catch (err) {
    console.error("[api/tokens/portfolio]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "RPC error" },
      { status: 502 },
    );
  }
}
