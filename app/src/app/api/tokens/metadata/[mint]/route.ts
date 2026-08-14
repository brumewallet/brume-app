import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";

const RPC: Record<string, string> = {
  devnet: "https://rpc.magicblock.app/devnet",
  "mainnet-beta": "https://rpc.magicblock.app/mainnet",
};

const TOKEN_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

const JUPITER_TOKEN_API = "https://token.jup.ag/all";
let jupiterTokenCache: Map<string, { name: string; symbol: string; logoURI: string | null; decimals: number }> | null = null;
let jupiterCacheExpiry = 0;

async function getJupiterTokens() {
  if (jupiterTokenCache && Date.now() < jupiterCacheExpiry) return jupiterTokenCache;
  try {
    const res = await fetch(JUPITER_TOKEN_API, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const tokens = (await res.json()) as Array<{ address: string; name: string; symbol: string; logoURI?: string; decimals: number }>;
    const map = new Map(tokens.map((t) => [t.address, { name: t.name, symbol: t.symbol, logoURI: t.logoURI ?? null, decimals: t.decimals }]));
    jupiterTokenCache = map;
    jupiterCacheExpiry = Date.now() + 3_600_000;
    return map;
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;
  const { searchParams } = new URL(request.url);
  const network = searchParams.get("network") ?? "devnet";
  const rpcUrl = searchParams.get("rpcUrl") ?? RPC[network] ?? RPC["devnet"];

  if (!mint) {
    return NextResponse.json({ error: "mint is required" }, { status: 400 });
  }

  const jupTokens = await getJupiterTokens();
  if (jupTokens?.has(mint)) {
    const t = jupTokens.get(mint)!;
    return NextResponse.json({
      name: t.name,
      symbol: t.symbol,
      logoUri: t.logoURI,
      metadataUri: null,
      decimals: t.decimals,
    });
  }

  // Fall back to on-chain Metaplex metadata
  try {
    const conn = new Connection(rpcUrl, "confirmed");
    const mintPubkey = new PublicKey(mint);
    const metadataProgramId = new PublicKey(TOKEN_METADATA_PROGRAM_ID);

    const [metadataPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), metadataProgramId.toBuffer(), mintPubkey.toBuffer()],
      metadataProgramId,
    );

    const accountInfo = await conn.getAccountInfo(metadataPda);
    if (!accountInfo) {
      return NextResponse.json({
        name: mint.slice(0, 6),
        symbol: mint.slice(0, 4).toUpperCase(),
        logoUri: null,
        metadataUri: null,
        decimals: null,
      });
    }

    // Parse Metaplex metadata: name at offset 65 (4-byte length prefix), symbol after
    const data = accountInfo.data;
    let offset = 65;
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString("utf8").replace(/\0/g, "").trim();
    offset += nameLen;
    const symbolLen = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLen).toString("utf8").replace(/\0/g, "").trim();
    offset += symbolLen;
    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const metadataUri = data.slice(offset, offset + uriLen).toString("utf8").replace(/\0/g, "").trim();

    let logoUri: string | null = null;
    if (metadataUri) {
      try {
        const metaRes = await fetch(metadataUri, { signal: AbortSignal.timeout(4000) });
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as { image?: string };
          logoUri = meta.image ?? null;
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      name: name || mint.slice(0, 6),
      symbol: symbol || mint.slice(0, 4).toUpperCase(),
      logoUri,
      metadataUri: metadataUri || null,
      decimals: null,
    });
  } catch (err) {
    console.error("[api/tokens/metadata]", err);
    return NextResponse.json({
      name: mint.slice(0, 6),
      symbol: mint.slice(0, 4).toUpperCase(),
      logoUri: null,
      metadataUri: null,
      decimals: null,
    });
  }
}
