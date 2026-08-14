import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function trimTrailingAmountZeros(s: string): string {
  return s.replace(/\.?0+$/, "")
}

export function formatTokenListAmount(n: number, maxDecimals = 4): string {
  if (!Number.isFinite(n)) return "0"
  return trimTrailingAmountZeros(n.toFixed(maxDecimals))
}
