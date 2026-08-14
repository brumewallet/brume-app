import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { type NftItem } from "@/background/api-client";
import { getNfts, burnNft } from "../messaging";
import { useWalletStore } from "../store";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const spring = { type: "spring", stiffness: 240, damping: 26 } as const;

// ─── Collection grouping ───────────────────────────────────────────────────

type GroupedCollection = {
  id: string | null;
  name: string;
  coverImage: string | null;
  items: NftItem[];
};

function groupByCollection(nfts: NftItem[]): GroupedCollection[] {
  const map = new Map<string, GroupedCollection>();
  for (const nft of nfts) {
    const key = nft.collection ?? "__none__";
    if (!map.has(key)) {
      map.set(key, {
        id: nft.collection,
        name: nft.collectionName ?? (nft.collection ? `${nft.collection.slice(0, 6)}…` : "Uncollected"),
        coverImage: null,
        items: [],
      });
    }
    const col = map.get(key)!;
    if (!col.coverImage && nft.image) col.coverImage = nft.image;
    col.items.push(nft);
  }
  return [...map.values()].sort((a, b) =>
    a.id === null ? 1 : b.id === null ? -1 : b.items.length - a.items.length,
  );
}

// ─── NFT image placeholder ────────────────────────────────────────────────

function NftPlaceholder({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

// ─── Collection card ───────────────────────────────────────────────────────

function CollectionCard({ col, index, onSelect }: { col: GroupedCollection; index: number; onSelect: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring, delay: index * 0.04 }}
      onClick={onSelect}
      className="flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60 text-left w-full focus:outline-none active:scale-95 transition-transform"
    >
      <div className="relative aspect-square w-full bg-muted/30 overflow-hidden">
        {col.coverImage && !imgFailed ? (
          <img src={col.coverImage} alt={col.name} className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            <NftPlaceholder size={40} />
          </div>
        )}
        <div className="absolute bottom-1.5 right-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
          {col.items.length}
        </div>
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[12px] font-semibold text-foreground">{col.name}</p>
      </div>
    </motion.button>
  );
}

// ─── NFT card ─────────────────────────────────────────────────────────────

function NftCard({ item, index, onSelect }: { item: NftItem; index: number; onSelect: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...spring, delay: index * 0.04 }}
      onClick={onSelect}
      className="flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/60 text-left w-full focus:outline-none active:scale-95 transition-transform"
    >
      <div className="relative aspect-square w-full bg-muted/30 overflow-hidden">
        {item.image && !imgFailed ? (
          <img src={item.image} alt={item.name} className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            <NftPlaceholder size={40} />
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <p className="truncate text-[12px] font-semibold text-foreground">{item.name}</p>
      </div>
    </motion.button>
  );
}

// ─── NFT detail drawer ────────────────────────────────────────────────────

function NftDetailDrawer({
  item,
  open,
  onClose,
  onBurned,
}: {
  item: NftItem | null;
  open: boolean;
  onClose: () => void;
  onBurned: (mint: string) => void;
}) {
  const [confirmBurn, setConfirmBurn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmBurn(false);
      setBusy(false);
      setError(null);
      setImgFailed(false);
    }
  }, [open]);

  async function handleBurn() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await burnNft(item.mint, item.collection, item.standard);
      onBurned(item.mint);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Burn failed");
      setBusy(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DrawerContent className="max-h-[88vh]">
        {item && (
          <div className="flex flex-col gap-4 p-5 pb-8 overflow-y-auto">
            <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-2xl aspect-square">
              {item.image && !imgFailed ? (
                <img src={item.image} alt={item.name} className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-muted/30 text-muted-foreground/30">
                  <NftPlaceholder size={56} />
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-[17px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {item.name}
              </p>
              {item.collectionName && (
                <p className="mt-0.5 text-[13px] text-muted-foreground">{item.collectionName}</p>
              )}
              <p className="mt-1 text-[11px] font-mono text-muted-foreground/50 break-all">{item.mint.slice(0, 20)}…</p>
            </div>

            <AnimatePresence mode="wait">
              {!confirmBurn ? (
                <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {item.frozen || item.standard === "programmable" ? (
                    <div className="rounded-xl bg-muted/60 border border-border/50 px-4 py-3 text-center">
                      <p className="text-[13px] font-medium text-muted-foreground">
                        {item.frozen ? "Frozen" : "pNFT"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted-foreground/60">
                        {item.frozen
                          ? "This NFT is permanently frozen and cannot be burned."
                          : "Programmable NFT burn is not supported yet."}
                      </p>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmBurn(true)}
                    >
                      Burn NFT
                    </Button>
                  )}
                </motion.div>
              ) : (
                <motion.div key="confirm" className="flex flex-col gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-center">
                    <p className="text-[13px] font-medium text-destructive">This cannot be undone.</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">The NFT will be permanently destroyed.</p>
                  </div>
                  {error && <p className="text-center text-[12px] text-destructive">{error}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setConfirmBurn(false); setError(null); }} disabled={busy}>
                      Cancel
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={handleBurn} disabled={busy}>
                      {busy ? "Burning…" : "Confirm Burn"}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ─── Main NFTs page ───────────────────────────────────────────────────────

type View =
  | { type: "collections" }
  | { type: "collection"; col: GroupedCollection };

export function NFTs() {
  const { state } = useWalletStore();
  const [nfts, setNfts] = useState<NftItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>({ type: "collections" });
  const [selectedNft, setSelectedNft] = useState<NftItem | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await getNfts(refresh);
      setNfts(res.nfts);
    } catch {
      setNfts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!state?.publicKey) return;
    void load(false);
  }, [state?.publicKey, state?.network, state?.rpcUrlOverride, load]);

  function handleBurned(mint: string) {
    setNfts((prev) => prev?.filter((n) => n.mint !== mint) ?? prev);
  }

  const collections = useMemo(() => (nfts ? groupByCollection(nfts) : []), [nfts]);

  const currentCollection = useMemo(() => {
    if (view.type !== "collection") return null;
    return collections.find((c) => c.id === view.col.id) ?? null;
  }, [view, collections]);

  const isInCollection = view.type === "collection";
  const displayTitle = isInCollection ? (currentCollection?.name ?? view.col.name) : "NFTs";

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {}
      <div className="flex items-center gap-2 border-b border-border px-3 py-3 shrink-0">
        {isInCollection && (
          <button
            onClick={() => setView({ type: "collections" })}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <h1
          className="flex-1 truncate text-[15px] font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {displayTitle}
        </h1>
        {nfts && !isInCollection && (
          <span className="text-[12px] text-muted-foreground">{nfts.length} items</span>
        )}
        {isInCollection && currentCollection && (
          <span className="text-[12px] text-muted-foreground">{currentCollection.items.length}</span>
        )}
        <button
          onClick={() => void load(true)}
          disabled={refreshing || loading}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent transition-colors",
            (refreshing || loading) && "opacity-40 cursor-not-allowed",
          )}
          aria-label="Refresh NFTs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      {}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" className="flex flex-col items-center justify-center gap-3 pt-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              <p className="text-[13px] text-muted-foreground">Loading NFTs…</p>
            </motion.div>
          ) : nfts && nfts.length === 0 ? (
            <motion.div key="empty" className="flex flex-col items-center justify-center gap-3 pt-16 text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-primary">
                <NftPlaceholder size={32} />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">No NFTs found</p>
                <p className="mt-1 text-[13px] text-muted-foreground">NFTs held by this wallet will appear here.</p>
              </div>
            </motion.div>
          ) : view.type === "collections" ? (
            <motion.div key="collections" className="grid grid-cols-2 gap-3 pt-4" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={spring}>
              {collections.map((col, i) => (
                <CollectionCard
                  key={col.id ?? "__none__"}
                  col={col}
                  index={i}
                  onSelect={() => setView({ type: "collection", col })}
                />
              ))}
            </motion.div>
          ) : currentCollection ? (
            <motion.div key={`col-${view.col.id ?? "none"}`} className="grid grid-cols-2 gap-3 pt-4" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={spring}>
              {currentCollection.items.map((item, i) => (
                <NftCard
                  key={item.mint}
                  item={item}
                  index={i}
                  onSelect={() => setSelectedNft(item)}
                />
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <NftDetailDrawer
        item={selectedNft}
        open={selectedNft !== null}
        onClose={() => setSelectedNft(null)}
        onBurned={handleBurned}
      />
    </motion.div>
  );
}
