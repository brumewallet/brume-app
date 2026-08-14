
export function privateRawPositive(raw: string | null | undefined): boolean {
  if (raw == null || raw === "") return false;
  try {
    return BigInt(raw) > 0n;
  } catch {
    return false;
  }
}

export function rawToHuman(rawStr: string, dec: number): number {
  try {
    const raw = rawStr && rawStr !== "" ? BigInt(rawStr) : 0n;
    return Number(raw) / Number(10n ** BigInt(dec));
  } catch {
    return 0;
  }
}

export function walletHumanFromRaw(
  amountRaw: string | null | undefined,
  decimals: number,
): number {
  try {
    if (amountRaw == null || amountRaw === "") return 0;
    return Number(BigInt(amountRaw)) / Number(10n ** BigInt(decimals));
  } catch {
    return 0;
  }
}

export function fiatForPrivateLeg(
  walletHuman: number,
  walletFiatUsd: number | null | undefined,
  privateHuman: number,
): number | null {
  if (
    walletFiatUsd == null ||
    !Number.isFinite(walletFiatUsd) ||
    walletHuman <= 0 ||
    privateHuman <= 0
  ) {
    return null;
  }
  return (privateHuman / walletHuman) * walletFiatUsd;
}
