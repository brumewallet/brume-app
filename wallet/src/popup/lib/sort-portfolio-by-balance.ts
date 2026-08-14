import type { PortfolioTokenRow } from "@brume/shared";

function rawAmountBigInt(amountRaw: string | undefined): bigint {
  if (amountRaw == null || amountRaw === "") return 0n;
  try {
    return BigInt(amountRaw);
  } catch {
    return 0n;
  }
}

export function sortPortfolioTokensByBalanceDesc(
  tokens: readonly PortfolioTokenRow[],
): PortfolioTokenRow[] {
  return [...tokens].sort((a, b) => {
    const ra = rawAmountBigInt(a.amountRaw);
    const rb = rawAmountBigInt(b.amountRaw);
    if (rb > ra) return 1;
    if (rb < ra) return -1;
    return a.mint.localeCompare(b.mint);
  });
}
