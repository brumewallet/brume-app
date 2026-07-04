import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowDownUp, ChevronRight } from "lucide-react";
import type { PortfolioTokenRow } from "@brume/shared";
import {
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { getNativeSolDisplay, getTokenListEntry } from "@/lib/token-metadata";
import { formatTokenListAmount, cn } from "@/lib/utils";
import { SOL_WRAPPED_MINT, isShieldFeatureEnabled } from "@/shared/constants";
import { BrumeIcon } from "../components/BrumeIcon";
import { PrivateLegAvatarBadge } from "../components/PrivateLegAvatarBadge";
import { useJupiterPortfolioPrices } from "../context/JupiterPortfolioPrices";
import { scheduleWalletStateRefresh } from "../lib/schedule-wallet-state-refresh";
import { sortPortfolioTokensByBalanceDesc } from "../lib/sort-portfolio-by-balance";
import * as msg from "../messaging";
import { useWalletStore } from "../store";
import { ShieldSolidIcon } from "@/components/Icons";

function sanitizeDecimalInput(value: string, maxDecimals: number): string {
  let s = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) {
    s = `${parts[0]}.${parts.slice(1).join("")}`;
  }
  if (parts.length === 2 && parts[1].length > maxDecimals) {
    s = `${parts[0]}.${parts[1].slice(0, maxDecimals)}`;
  }
  return s;
}

function humanToAmountString(n: number, decimals: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  const s = n.toFixed(Math.min(decimals, 8));
  return s.replace(/\.?0+$/, "");
}

function parseAmountToRaw(
  amountStr: string,
  decimals: number,
): bigint | null {
  try {
    const t = amountStr.trim().replace(/,/g, "");
    if (!t || t === "." || t.startsWith("-")) return null;
    const m = t.match(/^(\d*)(?:\.(\d+))?$/);
    if (!m) return null;
    const wi = m[1] || "0";
    let fr = m[2] || "";
    if (fr.length > decimals) return null;
    fr = fr.padEnd(decimals, "0");
    const whole = BigInt(wi || "0");
    const frac = decimals > 0 ? BigInt(fr || "0") : 0n;
    const scale = 10n ** BigInt(decimals);
    return whole * scale + frac;
  } catch {
    return null;
  }
}

function rawToHuman(rawStr: string, dec: number): number {
  const raw = rawStr && rawStr !== "" ? BigInt(rawStr) : 0n;
  return Number(raw) / Number(10n ** BigInt(dec));
}

// Larger of two integer raw strings; ignores invalid entries.

function maxBigintRaw(a?: string | null, b?: string | null): bigint {
  let x = 0n;
  let y = 0n;
  try {
    if (a != null && a !== "") x = BigInt(a);
  } catch {
        // ignore

  }
  try {
    if (b != null && b !== "") y = BigInt(b);
  } catch {
        // ignore

  }
  return x > y ? x : y;
}

function tokenHumanBalance(t: PortfolioTokenRow): number {
  try {
    return (
      Number(BigInt(t.amountRaw || "0")) /
      Number(10n ** BigInt(t.decimals))
    );
  } catch {
    return 0;
  }
}

// Token circle; optional shield badge only on the private / ephemeral leg.

function ShieldTokenAvatar(props: {
  symbol: string;
  logoUri?: string | null;
  size?: "md" | "lg";
    // When true, show shield icon overlapping the token (private balance side only).

  showShieldOverlay?: boolean;
}) {
  const { symbol, logoUri, size = "md", showShieldOverlay = false } = props;
  const dim = size === "lg" ? "h-11 w-11" : "h-10 w-10";
  const [failed, setFailed] = useState(false);
  const letter = symbol.charAt(0).toUpperCase();

  return (
    <div className="relative shrink-0">
      {logoUri && !failed ? (
        <img
          src={logoUri}
          alt=""
          className={cn("rounded-full object-cover ring-2 ring-border/50", dim)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground ring-2 ring-border/50",
            dim,
          )}
        >
          {letter}
        </div>
      )}
      {showShieldOverlay ? (
        <PrivateLegAvatarBadge large={size === "lg"} />
      ) : null}
    </div>
  );
}

function TokenSelectorPill(props: {
  symbol: string;
  logoUri?: string | null;
  disabled?: boolean;
  onOpen: () => void;
  size?: "md" | "lg";
  showShieldOverlay?: boolean;
}) {
  const {
    symbol,
    logoUri,
    disabled,
    onOpen,
    size = "md",
    showShieldOverlay = false,
  } = props;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-2xl border border-border/60 bg-card py-1 pl-1.5 pr-2 transition-[transform,colors] hover:bg-secondary active:scale-[0.98]",
        disabled && "pointer-events-none opacity-45",
      )}
      aria-label={`Select token, current ${symbol}`}
    >
      <ShieldTokenAvatar
        symbol={symbol}
        logoUri={logoUri}
        size={size}
        showShieldOverlay={showShieldOverlay}
      />
      <span className="max-w-[5.5rem] truncate text-sm font-semibold text-foreground">
        {symbol}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
    </button>
  );
}

export function Shield() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, refresh } = useWalletStore();
  const { splFiatApprox } = useJupiterPortfolioPrices();
  const tokens = useMemo(
    () => sortPortfolioTokensByBalanceDesc(state?.portfolioTokens ?? []),
    [state?.portfolioTokens],
  );

  const [tokenChoice, setTokenChoice] = useState<string>("");
  const [mode, setMode] = useState<"shield" | "unshield">("shield");
  const [amount, setAmount] = useState("");
  const [balanceInfo, setBalanceInfo] = useState<{
    decimals: number;
    baseBalanceRaw: string;
    privateBalanceRaw: string;
  } | null>(null);
  const [balanceErr, setBalanceErr] = useState<string | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokenDrawerOpen, setTokenDrawerOpen] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");

  useEffect(() => {
    void location;
  }, [location.state]);

  useEffect(() => {
    if (tokenDrawerOpen) setTokenSearch("");
  }, [tokenDrawerOpen]);

  const drawerTokens = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.mint.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }, [tokens, tokenSearch]);

  const mintEffective = tokenChoice.trim();
  const selectedRow = tokens.find((t) => t.mint === mintEffective) ?? null;

  const tokenMeta = useMemo(() => {
    if (selectedRow) {
      return {
        symbol: selectedRow.symbol,
        name: selectedRow.name,
        logoUri: selectedRow.logoUri,
      };
    }
    if (mintEffective === SOL_WRAPPED_MINT && state) {
      const n = getNativeSolDisplay(state.network);
      return {
        symbol: n.symbol,
        name: n.name,
        logoUri: n.logoURI,
      };
    }
    if (state && mintEffective.length >= 32) {
      const e = getTokenListEntry(mintEffective, state.network);
      if (e) {
        return {
          symbol: e.symbol,
          name: e.name,
          logoUri: e.logoURI ?? null,
        };
      }
    }
    return { symbol: "—", name: "", logoUri: null as string | null };
  }, [selectedRow, mintEffective, state]);

  const dec =
    balanceInfo?.decimals ??
    selectedRow?.decimals ??
    (mintEffective === SOL_WRAPPED_MINT && state
      ? getNativeSolDisplay(state.network).decimals
      : state && mintEffective.length >= 32
        ? getTokenListEntry(mintEffective, state.network)?.decimals
        : undefined) ??
    9;

    // 
  // Shield spend cap: max(Payments base balance, portfolio row). The API can
  // return 0 while the wallet snapshot still has the correct ATA amount.

  const capRaw = useMemo(() => {
    if (mode === "shield") {
      return maxBigintRaw(
        balanceInfo?.baseBalanceRaw,
        selectedRow?.amountRaw,
      );
    }
    if (balanceInfo) {
      return BigInt(balanceInfo.privateBalanceRaw || "0");
    }
    return 0n;
  }, [mode, balanceInfo, selectedRow]);

  const baseBalanceRawMerged = useMemo(
    () => maxBigintRaw(balanceInfo?.baseBalanceRaw, selectedRow?.amountRaw),
    [balanceInfo?.baseBalanceRaw, selectedRow?.amountRaw],
  );

  const baseHuman = useMemo(() => {
    return rawToHuman(baseBalanceRawMerged.toString(), dec);
  }, [baseBalanceRawMerged, dec]);

  const privateHuman = useMemo(() => {
    if (balanceInfo) {
      return rawToHuman(balanceInfo.privateBalanceRaw, balanceInfo.decimals);
    }
    return 0;
  }, [balanceInfo]);

  const sourceHuman = mode === "shield" ? baseHuman : privateHuman;
  const destHuman = mode === "shield" ? privateHuman : baseHuman;

  const holdingFiatUsd = useMemo(() => {
    return mintEffective ? splFiatApprox(mintEffective) : null;
  }, [splFiatApprox, mintEffective]);

  const unitUsdApprox = useMemo(() => {
    const humanFromPortfolio =
      selectedRow?.amountRaw != null && selectedRow.amountRaw !== ""
        ? rawToHuman(selectedRow.amountRaw, selectedRow.decimals)
        : 0;
    const denom =
      baseHuman > 0
        ? baseHuman
        : humanFromPortfolio > 0
          ? humanFromPortfolio
          : 0;
    if (holdingFiatUsd == null || denom <= 0) return null;
    return holdingFiatUsd / denom;
  }, [holdingFiatUsd, baseHuman, selectedRow?.amountRaw, selectedRow?.decimals]);

  const amountNum = Number.parseFloat(amount);
  const receiveUsdApprox =
    unitUsdApprox != null &&
    Number.isFinite(amountNum) &&
    amountNum > 0
      ? amountNum * unitUsdApprox
      : null;

  const loadBalances = useCallback(async () => {
    if (!mintEffective || mintEffective.length < 32) {
      setBalanceInfo(null);
      setBalanceErr(null);
      return;
    }
    setLoadingBalances(true);
    setBalanceErr(null);
    try {
      const info = await msg.getShieldBalances(mintEffective);
      setBalanceInfo(info);
    } catch (e) {
      setBalanceInfo(null);
      setBalanceErr(e instanceof Error ? e.message : "Could not load balances");
    } finally {
      setLoadingBalances(false);
    }
  }, [mintEffective]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadBalances();
    }, mintEffective.length >= 32 ? 0 : 400);
    return () => window.clearTimeout(t);
  }, [mintEffective, loadBalances]);

  useEffect(() => {
    if (tokenChoice || tokens.length === 0) return;
    setTokenChoice(tokens[0].mint);
  }, [tokens, tokenChoice]);

  function applyPct(pct: 25 | 50 | 100) {
    if (capRaw <= 0n) return;
    let raw: bigint;
    if (pct === 100) raw = capRaw;
    else if (pct === 50) raw = capRaw / 2n;
    else raw = capRaw / 4n;
    if (raw <= 0n) return;
    const human = Number(raw) / Number(10n ** BigInt(dec));
    setAmount(humanToAmountString(human, dec));
  }

  const amountWithinCap = useMemo(() => {
    if (!amount.trim() || capRaw <= 0n) return false;
    const raw = parseAmountToRaw(amount, dec);
    return raw != null && raw > 0n && raw <= capRaw;
  }, [amount, dec, capRaw]);

  const mintKnown =
    selectedRow != null ||
    mintEffective === SOL_WRAPPED_MINT ||
    (state != null &&
      mintEffective.length >= 32 &&
      getTokenListEntry(mintEffective, state.network) != null);

  const canSubmit =
    amountWithinCap &&
    !busy &&
    mintEffective.length >= 32 &&
    mintKnown &&
    capRaw > 0n;

  const primaryDisabled = !canSubmit;

  async function onSubmit() {
    setSubmitErr(null);
    setBusy(true);
    try {
      const { signature } = await msg.shieldSpl(mode, mintEffective, amount.trim());
      navigate(`/send/success?sig=${encodeURIComponent(signature)}`, {
        replace: true,
      });
      scheduleWalletStateRefresh(refresh);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function flipMode() {
    setMode((m) => (m === "shield" ? "unshield" : "shield"));
    setAmount("");
    setSubmitErr(null);
  }

  if (!state) return null;

  if (!isShieldFeatureEnabled(state.network)) {
    return (
      <motion.div
        className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <h1 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Shield</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Private balance (shield / unshield) is only supported on Solana Devnet
          for now. Switch network in Settings to use it.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-6 w-full max-w-xs rounded-2xl"
          onClick={() => navigate("/settings")}
        >
          Open Settings
        </Button>
      </motion.div>
    );
  }

  if (tokens.length === 0) {
    return (
      <motion.div
        className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <h1 className="text-base font-semibold" style={{ fontFamily: "var(--font-display)" }}>Shield</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          No tokens in your portfolio yet. Receive or buy SPL tokens first, then
          you can shield them here.
        </p>
      </motion.div>
    );
  }

  const rateLine =
    unitUsdApprox != null && Number.isFinite(unitUsdApprox)
      ? `1 ${tokenMeta.symbol} ≈ $${unitUsdApprox < 0.01 ? unitUsdApprox.toPrecision(3) : unitUsdApprox.toFixed(2)}`
      : null;

  const pctDisabled = busy || capRaw <= 0n;
  const inputDisabled = busy || capRaw <= 0n;

  return (
    <motion.div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <header className="flex items-start justify-between px-5 pt-4">
        <h1 className="text-[18px] font-semibold leading-7 text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Shield
        </h1>
        <Link
          to="/"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-2xl bg-secondary text-foreground transition-colors hover:bg-secondary/80",
          )}
          aria-label="Close"
        >
          <span className="sr-only">Close</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-foreground"
          >
            <path
              d="M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M6 6L18 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4 pt-6">
        <div className="flex flex-col gap-2" style={{ position: "relative", isolation: "isolate" }}>
          {/* From card */}
          <div className="rounded-2xl bg-card px-3 py-2.5" style={{ position: "relative", zIndex: 2 }}>
            <div className="flex items-center justify-between whitespace-nowrap">
              <span className="text-[16px] leading-5 text-muted-foreground">
                {mode === "shield" ? "You shield" : "You unshield"}
              </span>
              <div className="flex items-center gap-4 text-[14px] leading-5 text-primary">
                {(
                  [
                    { label: "25%", fn: () => applyPct(25) },
                    { label: "50%", fn: () => applyPct(50) },
                    { label: "Max", fn: () => applyPct(100) },
                  ] as const
                ).map(({ label, fn }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={pctDisabled}
                    className="bg-transparent p-0 text-[14px] font-normal text-primary transition-opacity hover:opacity-70 disabled:opacity-40"
                    onClick={() => fn()}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex h-12 items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                disabled={inputDisabled}
                onChange={(e) => setAmount(sanitizeDecimalInput(e.target.value, dec))}
                className="min-w-0 flex-1 bg-transparent p-0 text-[32px] font-semibold leading-9 text-muted-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              />
              <TokenSelectorPill
                symbol={tokenMeta.symbol}
                logoUri={tokenMeta.logoUri}
                disabled={busy}
                size="md"
                showShieldOverlay={mode === "unshield"}
                onOpen={() => setTokenDrawerOpen(true)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-background">
                  <ArrowDownUp size={12} className="text-muted-foreground/40" />
                </div>
                <span className="text-[14px] leading-5 text-muted-foreground">
                  {loadingBalances
                    ? "Updating…"
                    : balanceErr && mode === "unshield"
                      ? balanceErr
                      : rateLine ?? (balanceErr ? balanceErr : "—")}
                </span>
              </div>
              <span className="text-[14px] leading-5 text-muted-foreground">
                Balance: {sourceHuman.toLocaleString()}{" "}
              </span>
            </div>

            {/* Swap circle — toggles shield/unshield */}
            <button
              type="button"
              onClick={flipMode}
              disabled={busy}
              className="absolute bottom-[-18px] left-[calc(50%+4px)] z-[3] flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
              aria-label="Toggle shield direction"
            >
              <ArrowDownUp size={16} className="text-background" />
            </button>
          </div>

          {/* To card */}
          <div className="rounded-2xl border border-border bg-background px-3 py-3" style={{ zIndex: 1 }}>
            <div className="flex items-center">
              <span className="text-[16px] leading-5 text-muted-foreground">
                You receive
              </span>
            </div>
            <div className="flex h-12 items-center gap-1">
              <span className="min-w-0 flex-1 text-[32px] font-semibold leading-9 text-muted-foreground">
                {amountWithinCap && amount.trim() ? amount : "0"}
              </span>
              <TokenSelectorPill
                symbol={tokenMeta.symbol}
                logoUri={tokenMeta.logoUri}
                disabled={busy}
                size="md"
                showShieldOverlay={mode === "shield"}
                onOpen={() => setTokenDrawerOpen(true)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[20px] leading-6 text-muted-foreground/70">
                {receiveUsdApprox != null
                  ? `$${receiveUsdApprox < 0.01 ? receiveUsdApprox.toPrecision(2) : receiveUsdApprox.toFixed(2)}`
                  : "$0"}
              </span>
              <span className="text-[14px] leading-5 text-muted-foreground">
                Balance:{" "}
                {mode === "unshield" && !balanceInfo
                  ? "—"
                  : destHuman.toLocaleString(undefined, {
                      maximumFractionDigits: Math.min(8, dec),
                    })}
              </span>
            </div>
          </div>
        </div>

        {submitErr ? (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-center text-xs text-destructive">
            {submitErr}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-2xl text-[15px] font-normal"
          disabled={primaryDisabled}
          onClick={() => void onSubmit()}
        >
          {busy ? "Signing…" : "Confirm"}
        </Button>
      </div>

      {busy ? (
        <div className="absolute inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-sm">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 py-10">
            <div className="flex items-center gap-4 py-2">
              <div className="size-16 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                {tokenMeta.logoUri ? (
                  <img
                    src={tokenMeta.logoUri}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-muted text-lg font-bold text-foreground">
                    {tokenMeta.symbol.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <ChevronRight
                size={16}
                className="shrink-0 text-muted-foreground brume-chevron-bounce"
              />
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-secondary ring-1 ring-border">
                <ShieldSolidIcon className="h-9 w-9 text-primary" />
              </div>
            </div>
            <p className="text-center text-xl font-semibold text-foreground">
              {mode === "shield" ? "Shielding…" : "Unshielding…"}
            </p>
          </div>
          <div className="border-t border-border px-4 pb-6 pt-4">
            <Button
              type="button"
              size="lg"
              disabled
              className="h-12 w-full rounded-2xl bg-[var(--btn-disabled)] text-[15px] font-normal text-white opacity-100"
            >
              In progress…
            </Button>
          </div>
        </div>
      ) : null}

      <Drawer open={tokenDrawerOpen} onOpenChange={setTokenDrawerOpen}>
        <DrawerContent className="flex max-h-[88dvh] flex-col">
          <DrawerHeader className="space-y-0 px-5 text-left">
            <DrawerTitle>Select token</DrawerTitle>
          </DrawerHeader>
          <div className="relative px-4 pb-3">
            <BrumeIcon
              icon={Search01Icon}
              size={18}
              className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder="Search by name, symbol, or mint…"
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              className="h-11 rounded-2xl pl-10 text-[15px]"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-2">
            {drawerTokens.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tokens match your search.
              </p>
            ) : (
              drawerTokens.map((t) => {
                const human = tokenHumanBalance(t);
                const usd = splFiatApprox(t.mint);
                const selected = t.mint === mintEffective;
                return (
                  <button
                    key={t.mint}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 transition-colors",
                      selected
                        ? "bg-primary/10 ring-primary/35"
                        : "bg-muted/35 ring-border/50 hover:bg-muted/55",
                    )}
                    onClick={() => {
                      setTokenChoice(t.mint);
                      setAmount("");
                      setTokenDrawerOpen(false);
                    }}
                  >
                    <ShieldTokenAvatar symbol={t.symbol} logoUri={t.logoUri} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-foreground">
                        {t.symbol}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatTokenListAmount(human, Math.min(8, t.decimals))}{" "}
                        {t.symbol}
                        {t.name ? ` · ${t.name}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {usd != null && Number.isFinite(usd) ? (
                        <>
                          <div className="text-sm font-semibold tabular-nums text-foreground">
                            $
                            {usd < 0.01
                              ? usd.toPrecision(3)
                              : usd.toLocaleString(undefined, {
                                  maximumFractionDigits: 2,
                                })}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <DrawerFooter className="border-t border-border pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl text-[15px] font-semibold"
              onClick={() => setTokenDrawerOpen(false)}
            >
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </motion.div>
  );
}
