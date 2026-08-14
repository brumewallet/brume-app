import type { NetworkId } from "./constants";
import { knownTokenSymbol } from "./known-tokens";

const SOL_DECIMALS = 9;

function shortPk(pk: string | undefined, head = 4, tail = 4): string {
  if (!pk || pk.length <= head + tail + 1) return pk ?? "-";
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}

function formatSolFromLamports(lamports: number): string {
  const n = lamports / 10 ** SOL_DECIMALS;
  if (!Number.isFinite(n)) return "-";
  const s = n >= 1 ? n.toFixed(4) : n.toFixed(6);
  return `${s.replace(/\.?0+$/, "")} SOL`;
}

function formatTokenAmount(
  raw: string | undefined,
  decimals: number | undefined,
): string {
  if (raw == null || raw === "") return "-";
  try {
    const d = decimals ?? 0;
    const v = Number(raw) / 10 ** d;
    if (!Number.isFinite(v)) return raw;
    const s = v >= 1 ? v.toFixed(4) : v.toFixed(6);
    return s.replace(/\.?0+$/, "");
  } catch {
    return raw;
  }
}

export const ACTIVITY_BURN_COUNTERPARTY = "__BRUME_BURN__" as const;

export interface ParsedActivityTxShape {
  type?: string;
  description?: string;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number | string;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    mint?: string;
    tokenSymbol?: string;
    tokenAmount?: number;
    rawTokenAmount?: { tokenAmount?: string; decimals?: number };
  }>;
}

function looksLikeShortMintSymbol(s: string): boolean {
  return s.includes("…") && /^[1-9A-HJ-NP-Za-km-z]{2,8}…[1-9A-HJ-NP-Za-km-z]{2,8}$/.test(
    s,
  );
}

function activityTokenDisplaySymbol(
  t: NonNullable<ParsedActivityTxShape["tokenTransfers"]>[number],
  network: NetworkId | undefined,
): string {
  const mint = t.mint?.trim() || undefined;
  const known = knownTokenSymbol(mint, network);
  if (known) return known;
  const raw = (t.tokenSymbol ?? "").trim();
  if (raw && raw !== "SPL" && !looksLikeShortMintSymbol(raw)) {
    return raw.slice(0, 12);
  }
  if (mint) return shortPk(mint, 4, 4);
  return "Token";
}

export function walletActivityDisplay(
  tx: ParsedActivityTxShape,
  walletAddress: string,
  network?: NetworkId,
): { label: string; detail: string } {
  const desc = (tx.description ?? "").trim();
  const typeU = (tx.type ?? "").toUpperCase();

  if (typeU.includes("SWAP") || /swap/i.test(desc)) {
    return {
      label: "Swap",
      detail: desc || "Exchanged tokens on-chain",
    };
  }

  if (
    /\b(TOKEN_BURN|SPL_TOKEN_BURN|BURN_CHECKED)\b/i.test(typeU) ||
    (/\bBURN\b/i.test(typeU) && !/BURN_NFT/i.test(typeU))
  ) {
    const list = tx.tokenTransfers ?? [];
    for (const t of list) {
      const from = t.fromUserAccount ?? "";
      if (from !== walletAddress) continue;
      const sym = activityTokenDisplaySymbol(t, network);
      const raw = t.rawTokenAmount?.tokenAmount;
      const dec = t.rawTokenAmount?.decimals;
      let qty: string;
      if (raw != null) {
        qty = formatTokenAmount(raw, dec);
      } else if (t.tokenAmount != null && Number.isFinite(t.tokenAmount)) {
        qty = String(t.tokenAmount);
      } else {
        qty = "-";
      }
      return {
        label: "Burn",
        detail:
          qty !== "-"
            ? `${qty} ${sym} destroyed`
            : desc || `${sym} · tokens destroyed`,
      };
    }
    return {
      label: "Burn",
      detail: desc || "Tokens destroyed",
    };
  }

  const tokens = tx.tokenTransfers ?? [];
  for (const t of tokens) {
    const to = t.toUserAccount ?? "";
    const from = t.fromUserAccount ?? "";
    if (to === ACTIVITY_BURN_COUNTERPARTY && from === walletAddress) {
      const sym = activityTokenDisplaySymbol(t, network);
      const raw = t.rawTokenAmount?.tokenAmount;
      const dec = t.rawTokenAmount?.decimals;
      let qty: string;
      if (raw != null) {
        qty = formatTokenAmount(raw, dec);
      } else if (t.tokenAmount != null && Number.isFinite(t.tokenAmount)) {
        qty = String(t.tokenAmount);
      } else {
        qty = "-";
      }
      return {
        label: "Burn",
        detail:
          qty !== "-"
            ? `${qty} ${sym} destroyed`
            : `${sym} · tokens destroyed`,
      };
    }
  }

  const natives = tx.nativeTransfers ?? [];
  for (const t of natives) {
    const rawAmt = t.amount ?? 0;
    const lamports =
      typeof rawAmt === "string" ? Number.parseFloat(rawAmt) : rawAmt;
    if (!Number.isFinite(lamports) || lamports === 0) continue;
    const from = t.fromUserAccount ?? "";
    const to = t.toUserAccount ?? "";
    const amt = formatSolFromLamports(lamports);
    if (from === walletAddress && to !== walletAddress) {
      return {
        label: "Sent SOL",
        detail: `To ${shortPk(to)} · ${amt}`,
      };
    }
    if (to === walletAddress && from !== walletAddress) {
      return {
        label: "Received SOL",
        detail: `From ${shortPk(from)} · ${amt}`,
      };
    }
  }

  for (const t of tokens) {
    const from = t.fromUserAccount ?? "";
    const to = t.toUserAccount ?? "";
    const sym = activityTokenDisplaySymbol(t, network);
    const raw = t.rawTokenAmount?.tokenAmount;
    const dec = t.rawTokenAmount?.decimals;
    let qty: string;
    if (raw != null) {
      qty = formatTokenAmount(raw, dec);
    } else if (t.tokenAmount != null && Number.isFinite(t.tokenAmount)) {
      qty = String(t.tokenAmount);
    } else {
      qty = "-";
    }
    const mintHint = t.mint ? shortPk(t.mint, 4, 4) : "";

    if (to === ACTIVITY_BURN_COUNTERPARTY) continue;
    if (from === walletAddress && to && to !== walletAddress) {
      return {
        label: `Sent ${sym}`,
        detail:
          qty !== "-"
            ? `To ${shortPk(to)} · ${qty} ${sym}`
            : `To ${shortPk(to)}${mintHint ? ` · ${mintHint}` : ""}`,
      };
    }
    if (to === walletAddress && from && from !== walletAddress) {
      return {
        label: `Received ${sym}`,
        detail:
          qty !== "-"
            ? `From ${shortPk(from)} · ${qty} ${sym}`
            : `From ${shortPk(from)}${mintHint ? ` · ${mintHint}` : ""}`,
      };
    }
  }

  if (desc) {
    const label =
      typeU.length > 0
        ? typeU
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : "Activity";
    return { label, detail: desc };
  }

  return {
    label: "Transaction",
    detail: "Open in explorer for full details",
  };
}
