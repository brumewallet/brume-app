import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { getNativeSolDisplay } from "@/lib/token-metadata";
import { useJupiterPortfolioPrices } from "../context/JupiterPortfolioPrices";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../components/PageHeader";
import { TokenRow } from "../components/TokenRow";
import {
  fiatForPrivateLeg,
  privateRawPositive,
  rawToHuman,
  walletHumanFromRaw,
} from "../lib/private-balance-helpers";
import { sortPortfolioTokensByBalanceDesc } from "../lib/sort-portfolio-by-balance";
import * as msg from "../messaging";
import { SOL_WRAPPED_MINT, isShieldFeatureEnabled } from "@/shared/constants";
import { useWalletStore } from "../store";
import { SearchIcon } from "@/components/Icons";

function solSearchMatches(q: string, solSymbol: string, solName: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return (
    solSymbol.toLowerCase().includes(t) ||
    solName.toLowerCase().includes(t) ||
    t.includes("sol") ||
    "solana".includes(t)
  );
}

export function Send() {
  const { state } = useWalletStore();
  const { solFiatApprox, splFiatApprox } = useJupiterPortfolioPrices();
  const [q, setQ] = useState("");
  const [batchShieldByMint, setBatchShieldByMint] = useState<Record<
    string,
    string
  > | null>(null);

  const solList = useMemo(
    () => getNativeSolDisplay(state?.network ?? "devnet"),
    [state?.network],
  );

  const sortedSpl = useMemo(
    () => sortPortfolioTokensByBalanceDesc(state?.portfolioTokens ?? []),
    [state?.portfolioTokens],
  );

  const splMintKey = useMemo(
    () => [...sortedSpl.map((t) => t.mint), SOL_WRAPPED_MINT].sort().join(","),
    [sortedSpl],
  );

  const shieldEnabled = isShieldFeatureEnabled(state?.network ?? "devnet");

  const loadPrivateBalances = useCallback(async () => {
    if (!shieldEnabled) {
      setBatchShieldByMint({});
      return;
    }
    const mints = [...new Set([...sortedSpl.map((t) => t.mint), SOL_WRAPPED_MINT])];
    try {
      const map = await msg.getShieldBalancesBatch(mints);
      setBatchShieldByMint(map);
    } catch {
      setBatchShieldByMint(null);
    }
  }, [sortedSpl, shieldEnabled]);

  useEffect(() => {
    void loadPrivateBalances();
  }, [splMintKey, loadPrivateBalances]);

  useEffect(() => {
    setBatchShieldByMint(null);
  }, [state?.publicKey, state?.network, splMintKey]);

  const privateByMint = shieldEnabled
    ? (batchShieldByMint ?? state?.shieldedBalancesByMint ?? {})
    : {};

  const filteredSpl = useMemo(() => {
    const list = state?.portfolioTokens ?? [];
    const t = q.trim().toLowerCase();
    const filtered =
      !t
        ? list
        : list.filter(
            (row) =>
              row.mint.toLowerCase().includes(t) ||
              row.symbol.toLowerCase().includes(t) ||
              row.name.toLowerCase().includes(t),
          );
    return sortPortfolioTokensByBalanceDesc(filtered);
  }, [state?.portfolioTokens, q]);

  const splPrivateRows = useMemo(() => {
    return filteredSpl.filter((t) =>
      privateRawPositive(privateByMint[t.mint]),
    );
  }, [filteredSpl, privateByMint]);

  const splPrivateSorted = useMemo(() => {
    return [...splPrivateRows].sort((a, b) => {
      const ha = rawToHuman(privateByMint[a.mint] ?? "0", a.decimals);
      const hb = rawToHuman(privateByMint[b.mint] ?? "0", b.decimals);
      return hb - ha;
    });
  }, [splPrivateRows, privateByMint]);

  const solPrivateRaw = privateByMint[SOL_WRAPPED_MINT];
  const showSolPrivate =
    privateRawPositive(solPrivateRaw) &&
    solSearchMatches(q, solList.symbol, solList.name);

  const hasPrivateSection = splPrivateSorted.length > 0 || showSolPrivate;

  const walletSolHuman = state
    ? walletHumanFromRaw(state.balanceSolBaseUnits, solList.decimals)
    : 0;
  const solPrivateHuman = rawToHuman(solPrivateRaw ?? "0", solList.decimals);
  const solPrivateFiat = fiatForPrivateLeg(
    walletSolHuman,
    solFiatApprox,
    solPrivateHuman,
  );

  if (!state) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <PageHeader title="Send" backTo="/" />
      <motion.div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6 pt-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
      >
        <p className="text-sm text-muted-foreground">
          Choose an asset to send from your wallet.
        </p>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, symbol, or mint…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 rounded-2xl pl-10 text-[15px]"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55" style={{ fontFamily: "var(--font-display)" }}>
            Wallet
          </p>
          <TokenRow
            to="/send/sol"
            navState={{ sendBackTo: "/send" }}
            symbol={solList.symbol}
            name={solList.name}
            amountRaw={state.balanceSolBaseUnits}
            decimals={solList.decimals}
            simpleMode={state.simpleMode}
            logoUri={solList.logoURI}
            verified={solList.fromRegistry}
            fiatUsdApprox={solFiatApprox}
          />
          {filteredSpl.map((t) => (
            <TokenRow
              key={t.mint}
              to={`/send/spl/${encodeURIComponent(t.mint)}`}
              navState={{ sendBackTo: "/send" }}
              symbol={t.symbol}
              name={t.name}
              amountRaw={t.amountRaw}
              decimals={t.decimals}
              simpleMode={state.simpleMode}
              logoUri={t.logoUri}
              verified={false}
              fiatUsdApprox={splFiatApprox(t.mint)}
            />
          ))}
        </div>

        {hasPrivateSection ? (
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4 pb-1 pr-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55" style={{ fontFamily: "var(--font-display)" }}>
              Private balance
            </p>
            <p className="text-xs text-muted-foreground">
              Tap a row to send from your shielded balance. Use Shield in the
              nav to move funds between wallet and private.
            </p>
            {showSolPrivate ? (
              <TokenRow
                key="private-sol"
                to={`/send/spl/${encodeURIComponent(SOL_WRAPPED_MINT)}`}
                navState={{
                  sendBackTo: "/send",
                  
                }}
                symbol={solList.symbol}
                name={solList.name}
                amountRaw={solPrivateRaw ?? "0"}
                decimals={solList.decimals}
                simpleMode={state.simpleMode}
                logoUri={solList.logoURI}
                verified={solList.fromRegistry}
                fiatUsdApprox={solPrivateFiat}
                
              />
            ) : null}
            {splPrivateSorted.map((t) => {
              const privRaw = privateByMint[t.mint] ?? "0";
              const wHum = walletHumanFromRaw(t.amountRaw, t.decimals);
              const pHum = rawToHuman(privRaw, t.decimals);
              const rowFiat = fiatForPrivateLeg(
                wHum,
                splFiatApprox(t.mint),
                pHum,
              );
              return (
                <TokenRow
                  key={`private-${t.mint}`}
                  to={`/send/spl/${encodeURIComponent(t.mint)}`}
                  navState={{
                    sendBackTo: "/send",
                    
                  }}
                  symbol={t.symbol}
                  name={t.name}
                  amountRaw={privRaw}
                  decimals={t.decimals}
                  simpleMode={state.simpleMode}
                  logoUri={t.logoUri}
                  verified={false}
                  fiatUsdApprox={rowFiat}
                  
                />
              );
            })}
          </div>
        ) : null}

        {filteredSpl.length === 0 && q.trim() ? (
          <p className="text-center text-sm text-muted-foreground">
            {`No tokens match "${q.trim()}".`}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
