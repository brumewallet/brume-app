import { motion } from "motion/react";
import { EyeIcon, EyeSlashIcon } from "@/components/Icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { getNativeSolDisplay } from "@/lib/token-metadata";
import { cn } from "@/lib/utils";
import { SOL_WRAPPED_MINT } from "@/shared/constants";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ActionBar } from "../components/ActionBar";
import { BalanceCard } from "../components/BalanceCard";
import { BrumeIcon } from "../components/BrumeIcon";
import { TokenRow } from "../components/TokenRow";
import { useJupiterPortfolioPrices } from "../context/JupiterPortfolioPrices";
import { nativeSolTokenPath } from "../lib/native-sol-route";
import { scheduleWalletStateRefresh } from "../lib/schedule-wallet-state-refresh";
import { sortPortfolioTokensByBalanceDesc } from "../lib/sort-portfolio-by-balance";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

export function Dashboard() {
  const { state, refresh } = useWalletStore();
  const {
    totalUsdApprox,
    totalPortfolioSolApprox,
    solFiatApprox,
    splFiatApprox,
    refetch: refetchUsdPrices,
  } = useJupiterPortfolioPrices();
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);

  const solList = useMemo(
    () => getNativeSolDisplay(state?.network ?? "devnet"),
    [state?.network],
  );

  // Show wSOL in the token list with its own row (separate from native SOL)
  const sortedSpl = useMemo(
    () => sortPortfolioTokensByBalanceDesc(state?.portfolioTokens ?? []),
    [state?.portfolioTokens],
  );

  if (!state) return null;

  async function onRefreshBalance() {
    setBalanceRefreshing(true);
    try {
      await msg.refreshBalanceFromChain();
      scheduleWalletStateRefresh(async () => {
        await refresh();
        await refetchUsdPrices();
      });
    } finally {
      setBalanceRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
      {state.rpcError ? (
        <Alert className="rounded-2xl border-amber-500/35 bg-amber-500/10 text-amber-100">
          <AlertTitle className="text-amber-100">RPC blocked or unreachable</AlertTitle>
          <AlertDescription className="text-xs text-amber-100/85">
            Public Solana endpoints often return 403 from extensions. Add a
            provider URL (QuickNode, Alchemy, etc.) under Settings → RPC.
          </AlertDescription>
          <p className="mt-2 line-clamp-2 font-mono text-[10px] text-amber-200/90">{state.rpcError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-8 rounded-xl text-xs" onClick={() => void msg.refreshBalanceFromChain().then(() => refresh())}>
              Retry
            </Button>
            <Link to="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex h-8 items-center rounded-xl border-border/80 px-3 text-xs")}>
              RPC settings
            </Link>
          </div>
        </Alert>
      ) : null}

      {state.indexerError ? (
        <Alert className="rounded-2xl border-rose-500/35 bg-rose-500/10 text-rose-100">
          <AlertTitle className="text-rose-100">Brume API unreachable</AlertTitle>
          <AlertDescription className="text-xs text-rose-100/85">
            SPL names, logos, and activity come from the Next.js app at localhost:3000.
          </AlertDescription>
          <p className="mt-2 line-clamp-3 font-mono text-[10px] text-rose-200/90">{state.indexerError}</p>
          <Button type="button" size="sm" className="mt-3 h-8 rounded-xl text-xs" onClick={() => void msg.refreshBalanceFromChain().then(() => refresh())}>
            Retry
          </Button>
        </Alert>
      ) : null}

      <div className="relative">
        <div className="absolute right-2 top-2 z-[1] flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-7 rounded-full text-muted-foreground/60 hover:text-muted-foreground"
            aria-label={balanceHidden ? "Show balance" : "Hide balance"}
            onClick={() => setBalanceHidden((h) => !h)}
          >
            {balanceHidden ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="size-7 rounded-full text-muted-foreground/60 hover:text-muted-foreground"
            aria-label="Refresh balance"
            disabled={balanceRefreshing}
            onClick={() => void onRefreshBalance()}
          >
            <BrumeIcon icon={Refresh01Icon} size={14} className={balanceRefreshing ? "brume-sidebar-spin" : undefined} />
          </Button>
        </div>
        <BalanceCard
          balanceSolBaseUnits={state.balanceSolBaseUnits}
          balanceHidden={balanceHidden}
          simpleMode={state.simpleMode}
          totalUsdApprox={totalUsdApprox}
          totalPortfolioSolApprox={totalPortfolioSolApprox}
        />
      </div>

      <ActionBar />

      <motion.div
        className="border-b border-border pb-2 pt-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.16, duration: 0.3 }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55" style={{ fontFamily: "var(--font-display)" }}>
          Tokens
        </span>
      </motion.div>

      <TokenRow
        to={nativeSolTokenPath()}
        navState={{ tokenDetailBackTo: "/" }}
        symbol={solList.symbol}
        name={solList.name}
        amountRaw={state.balanceSolBaseUnits}
        decimals={solList.decimals}
        simpleMode={state.simpleMode}
        logoUri={solList.logoURI}
        verified={solList.fromRegistry}
        fiatUsdApprox={solFiatApprox}
        hideBalance={balanceHidden}
      />

      {sortedSpl.map((t) => (
        <TokenRow
          key={t.mint}
          to={t.mint === SOL_WRAPPED_MINT ? `/token/${encodeURIComponent(t.mint)}` : `/token/${encodeURIComponent(t.mint)}`}
          navState={{ tokenDetailBackTo: "/" }}
          symbol={t.symbol}
          name={t.name}
          amountRaw={t.amountRaw}
          decimals={t.decimals}
          simpleMode={state.simpleMode}
          logoUri={t.logoUri}
          verified={t.verified ?? false}
          fiatUsdApprox={splFiatApprox(t.mint)}
          hideBalance={balanceHidden}
        />
      ))}
    </div>
  );
}
