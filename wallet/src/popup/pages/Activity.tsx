import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { DEFAULT_EXPLORER_ID, explorerTxUrl } from "@/shared/constants";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function activityDateHeading(blockTime: number | null): string {
  if (blockTime == null) return "Unknown date";
  const txDate = new Date(blockTime * 1000);
  const now = new Date();
  if (startOfLocalDay(txDate) === startOfLocalDay(now)) return "Today";
  const y = now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (txDate.getFullYear() !== y) opts.year = "numeric";
  return txDate.toLocaleDateString(undefined, opts);
}

export function Activity() {
  const { state } = useWalletStore();
  const [items, setItems] = useState<
    Array<{
      signature: string;
      slot: number | null;
      err: unknown;
      blockTime: number | null;
      summary?: string;
      txType?: string | null;
      source?: string | null;
      displayLabel?: string;
      displayDetail?: string;
      activityIcons?: Array<{
        kind: "sol" | "token";
        mint?: string;
        logoUri: string | null;
      }>;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rpcErr, setRpcErr] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  async function loadActivity(refresh: boolean) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await msg.getActivity(20, refresh);
      setItems(res.items);
      setRpcErr(res.rpcError ?? null);
      setCachedAt(res.cachedAt ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadActivity(false);
  }, [state?.publicKey, state?.rpcUrlOverride]);

  const net = state?.network ?? "devnet";

  const groupedSections = useMemo(() => {
    const byHeading = new Map<string, typeof items>();
    const order: string[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const h = activityDateHeading(it.blockTime);
      if (!seen.has(h)) {
        seen.add(h);
        order.push(h);
      }
      const list = byHeading.get(h) ?? [];
      list.push(it);
      byHeading.set(h, list);
    }
    return order.map((heading) => ({
      heading,
      rows: byHeading.get(heading) ?? [],
    }));
  }, [items]);

  return (
    <motion.div
      className="flex flex-col gap-3 px-4 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-start justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>Activity</h1>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 shrink-0 rounded-xl px-3 text-xs"
          disabled={loading || refreshing}
          onClick={() => void loadActivity(true)}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {cachedAt != null && !loading ? (
        <p className="text-[10px] text-muted-foreground">
          Updated {new Date(cachedAt).toLocaleString()}
        </p>
      ) : null}
      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={`sk-${i}`}
              className="flex items-center gap-3 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-3"
            >
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-[55%] max-w-[200px]" />
                <Skeleton className="h-3 w-[85%] max-w-[280px]" />
              </div>
            </div>
          ))}
        </div>
      ) : rpcErr && items.length === 0 ? (
        <Alert className="rounded-2xl border-amber-500/35 bg-amber-500/10 text-amber-100">
          <AlertTitle className="text-amber-100">Could not load activity</AlertTitle>
          <AlertDescription className="space-y-2 text-xs text-amber-100/85">
            {/Brume API|Failed to fetch|NetworkError|localhost/i.test(rpcErr) ? (
              <p>
                The Brume Next.js API is not reachable (see{" "}
                <code className="rounded bg-black/20 px-1">
                  DEFAULT_BRUME_API_ORIGIN
                </code>{" "}
                in shared constants). Start the API on port 3001 or point the
                constant at your deployment.
              </p>
            ) : (
              <p>RPC or network issue. Check Settings → RPC if you use a custom endpoint.</p>
            )}
            <p className="font-mono text-[10px] text-amber-100/80">{rpcErr}</p>
          </AlertDescription>
          <Link
            to="/settings"
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "mt-2 h-auto p-0 text-primary",
            )}
          >
            RPC settings
          </Link>
        </Alert>
      ) : items.length === 0 ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>No transactions yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groupedSections.map(({ heading, rows }) => (
            <section key={heading}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55" style={{ fontFamily: "var(--font-display)" }}>
                {heading}
              </h2>
              <ul className="flex flex-col gap-0 divide-y divide-border rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50">
                {rows.map((it) => {
                  const title =
                    it.displayLabel ??
                    (it.err
                      ? "Failed"
                      : it.txType
                        ? it.txType.replace(/_/g, " ")
                        : "Transaction");
                  const body =
                    it.displayDetail ??
                    (it.summary ? it.summary : null) ??
                    (it.source && !it.summary
                      ? it.source.replace(/_/g, " ")
                      : null);
                  return (
                    <li
                      key={it.signature}
                      className="p-3 transition-colors duration-150 hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 gap-2.5">
                          {it.activityIcons && it.activityIcons.length > 0 ? (
                            <div className="flex shrink-0 -space-x-1.5 pt-0.5">
                              {it.activityIcons.map((ic, idx) => (
                                <span
                                  key={`${it.signature}-ic-${idx}`}
                                  className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-muted ring-2 ring-card"
                                >
                                  {ic.logoUri ? (
                                    <img
                                      src={ic.logoUri}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display =
                                          "none";
                                      }}
                                    />
                                  ) : (
                                    <span className="text-[10px] font-medium text-muted-foreground">
                                      {ic.kind === "sol" ? "◎" : "?"}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="min-w-0 flex-1">
                          <p
                            className={`text-[15px] font-semibold leading-snug ${
                              it.err ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {title}
                          </p>
                          {body ? (
                            <p className="mt-1 line-clamp-4 text-[13px] leading-snug text-muted-foreground">
                              {body}
                            </p>
                          ) : null}
                          </div>
                        </div>
                        {it.blockTime != null && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {new Date(it.blockTime * 1000).toLocaleTimeString(
                              undefined,
                              {
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        )}
                      </div>
                      <a
                        href={explorerTxUrl(
                          state?.explorerId ?? DEFAULT_EXPLORER_ID,
                          net,
                          it.signature,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block truncate font-mono text-[10px] text-primary underline-offset-2 hover:underline"
                      >
                        View transaction
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </motion.div>
  );
}
