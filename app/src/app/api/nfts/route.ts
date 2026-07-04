import { NextResponse } from "next/server";

const RPC: Record<string, string> = {
  devnet: "https://rpc.magicblock.app/devnet",
  "mainnet-beta": "https://rpc.magicblock.app/mainnet",
};

// If HELIUS_API_KEY is set, use Helius DAS endpoints which have full NFT support.
const HELIUS_KEY = process.env.HELIUS_API_KEY ?? "";
console.log("[api/nfts] HELIUS_KEY loaded:", HELIUS_KEY ? `${HELIUS_KEY.slice(0, 8)}…` : "(empty)");

function heliusRpc(network: string): string | null {
  if (!HELIUS_KEY) return null;
  return network === "mainnet-beta"
    ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
    : `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const network = searchParams.get("network") ?? "devnet";
  // Helius key takes priority — it supports DAS. Falls back to passed rpcUrl, then default.
  const rpcUrl = heliusRpc(network) ?? searchParams.get("rpcUrl") ?? RPC[network] ?? RPC["devnet"];

  if (!owner) return NextResponse.json({ error: "owner required" }, { status: 400 });

  // Use Metaplex DAS (Digital Asset Standard) getAssetsByOwner RPC method.
  // Works on Helius RPC nodes and MagicBlock (which proxies DAS on devnet).
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "brume-nfts",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: owner,
          page: 1,
          limit: 1000,
          displayOptions: { showUnverifiedCollections: true, showCollectionMetadata: true },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`RPC ${res.status}`);
    const body = (await res.json()) as {
      result?: {
        items?: Array<{
          id: string;
          content?: {
            metadata?: { name?: string };
            links?: { image?: string };
            files?: Array<{ uri?: string; mime?: string }>;
            json_uri?: string;
          };
          grouping?: Array<{ group_key: string; group_value: string; collection_metadata?: { name?: string } }>;
          interface?: string;
          token_info?: { decimals?: number; supply?: number };
          is_frozen?: boolean;
          plugins?: Record<string, { data?: Record<string, unknown>; authority?: { type?: string; address?: string | null } }>;
        }>;
      };
      error?: { message?: string };
    };

    if (body.error) throw new Error(body.error.message ?? "DAS error");

    const items = body.result?.items ?? [];
    console.log("[api/nfts] total items from DAS:", items.length, items.map((i) => i.interface));

    // Helius DAS interface values for NFTs (legacy + MPL Core)
    const NFT_IFACES = new Set(["V1_NFT", "LEGACY_NFT", "V2_NFT", "ProgrammableNFT", "V1_PRINT", "MplCoreAsset"]);

    const nfts: NftItem[] = items
      .filter((item) => {
        const iface = item.interface ?? "";
        if (NFT_IFACES.has(iface)) return true;
        // Fallback: token with decimals=0, supply=1
        const decimals = item.token_info?.decimals ?? -1;
        const supply = item.token_info?.supply ?? -1;
        return decimals === 0 && supply === 1;
      })
      .map((item) => {
        const iface = item.interface ?? "";
        const image =
          item.content?.links?.image ??
          item.content?.files?.find((f) => f.mime?.startsWith("image/"))?.uri ??
          null;
        const colGroup = item.grouping?.find((g) => g.group_key === "collection");
        const standard: NftItem["standard"] =
          iface === "MplCoreAsset"
            ? "mpl-core"
            : iface === "ProgrammableNFT"
              ? "programmable"
              : "legacy";
        // frozen = permanent_freeze_delegate frozen=true (MPL Core) or top-level is_frozen (legacy)
        const frozen =
          item.is_frozen === true ||
          (item.plugins?.permanent_freeze_delegate?.data?.frozen === true);
        return {
          mint: item.id,
          name: item.content?.metadata?.name ?? item.id.slice(0, 8),
          image,
          collection: colGroup?.group_value ?? null,
          collectionName: colGroup?.collection_metadata?.name ?? null,
          standard,
          frozen,
        };
      });

    return NextResponse.json({ nfts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/nfts] DAS error:", msg);
    return NextResponse.json({ nfts: [], hint: `DAS error: ${msg}` });
  }
}
