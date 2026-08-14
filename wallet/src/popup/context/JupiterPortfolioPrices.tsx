import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getJupiterUsdPricesForMints,
  JUPITER_SOL_PRICE_MINT,
  portfolioHoldingsKey,
  portfolioPriceMintList,
  totalPortfolioUsdApprox,
  usdForHolding,
} from "@brume/shared";
import type { PortfolioTokenRow } from "@brume/shared";
import { useWalletStore } from "../store";

const REFRESH_MS = 45_000;

export type JupiterPortfolioPricing = {

  totalUsdApprox: number | null;

  totalPortfolioSolApprox: number | null;
  solFiatApprox: number | null;
  splFiatApprox: (mint: string) => number | null;
  refetch: () => Promise<void>;
  pricesReady: boolean;
};

const JupiterPortfolioPricesContext =
  createContext<JupiterPortfolioPricing | null>(null);

function usePortfolioPricingEngine(input: {
  balanceSolBaseUnits: string | null | undefined;
  portfolioTokens: readonly PortfolioTokenRow[] | undefined;
}): JupiterPortfolioPricing {
  const tokenMintsSerialized = useMemo(
    () =>
      (input.portfolioTokens ?? [])
        .map((t) => t.mint)
        .sort()
        .join(","),
    [input.portfolioTokens],
  );

  const mintList = useMemo(
    () => portfolioPriceMintList(input.portfolioTokens),
    [tokenMintsSerialized],
  );

  const [prices, setPrices] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getJupiterUsdPricesForMints(mintList).then((m) => {
      if (!cancelled) setPrices(m);
    });
    return () => {
      cancelled = true;
    };
  }, [mintList]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void getJupiterUsdPricesForMints(mintList, { bypassCache: true }).then(
        setPrices,
      );
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [mintList]);

  const refetch = useCallback(() => {
    return getJupiterUsdPricesForMints(mintList, { bypassCache: true }).then(
      setPrices,
    );
  }, [mintList]);

  const holdingsKey = useMemo(
    () =>
      portfolioHoldingsKey(
        input.balanceSolBaseUnits,
        input.portfolioTokens,
      ),
    [input.balanceSolBaseUnits, input.portfolioTokens],
  );

  const totalUsdApprox = useMemo(() => {
    if (prices == null) return null;
    return totalPortfolioUsdApprox({
      balanceSolBaseUnits: input.balanceSolBaseUnits,
      portfolioTokens: input.portfolioTokens,
      usdPerMint: prices,
    });
  }, [prices, holdingsKey]);

  const totalPortfolioSolApprox = useMemo(() => {
    if (prices == null || totalUsdApprox == null) return null;
    const solUsd = prices.get(JUPITER_SOL_PRICE_MINT);
    if (
      solUsd == null ||
      !Number.isFinite(solUsd) ||
      solUsd <= 0
    ) {
      return null;
    }
    return totalUsdApprox / solUsd;
  }, [prices, totalUsdApprox]);

  const solFiatApprox = useMemo(() => {
    if (prices == null) return null;
    return usdForHolding(
      input.balanceSolBaseUnits ?? "",
      9,
      prices.get(JUPITER_SOL_PRICE_MINT),
    );
  }, [prices, input.balanceSolBaseUnits]);

  const splFiatApprox = useCallback(
    (mint: string) => {
      if (prices == null) return null;
      const t = input.portfolioTokens?.find((x) => x.mint === mint);
      if (!t) return null;
      return usdForHolding(t.amountRaw, t.decimals, prices.get(mint));
    },
    [prices, input.portfolioTokens],
  );

  return useMemo(
    () => ({
      totalUsdApprox,
      totalPortfolioSolApprox,
      solFiatApprox,
      splFiatApprox,
      refetch,
      pricesReady: prices != null,
    }),
    [
      totalUsdApprox,
      totalPortfolioSolApprox,
      solFiatApprox,
      splFiatApprox,
      refetch,
      prices,
    ],
  );
}

function LiveJupiterPortfolioPricesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { state } = useWalletStore();
  const api = usePortfolioPricingEngine({
    balanceSolBaseUnits: state?.balanceSolBaseUnits ?? null,
    portfolioTokens: state?.portfolioTokens ?? undefined,
  });
  return (
    <JupiterPortfolioPricesContext.Provider value={api}>
      {children}
    </JupiterPortfolioPricesContext.Provider>
  );
}

export function JupiterPortfolioPricesProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LiveJupiterPortfolioPricesProvider>
      {children}
    </LiveJupiterPortfolioPricesProvider>
  );
}

export function useJupiterPortfolioPrices(): JupiterPortfolioPricing {
  const v = useContext(JupiterPortfolioPricesContext);
  if (!v) {
    throw new Error(
      "useJupiterPortfolioPrices must be used within JupiterPortfolioPricesProvider",
    );
  }
  return v;
}
