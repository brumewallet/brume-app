import {
  Connection,
  SendTransactionError,
  SolanaJSONRPCError,
} from "@solana/web3.js";

export const WalletErrorCodes = {
  WalletNotReady: 4001,
  WalletConnectionError: 4002,
  WalletDisconnected: 4003,
  WalletSignTransactionError: 4004,
  WalletSignMessageError: 4005,
  WalletTimeoutError: 4006,
  WalletWindowClosedError: 4007,
  WalletUserRejected: 4100,
} as const;

export function walletError(
  code: number,
  message: string,
): { code: number; message: string } {
  return { code, message };
}

type ErrorWithSolanaMeta = Error & {
  transactionMessage?: unknown;
  transactionLogs?: string[];
  cause?: unknown;
};

function stringifyUnknown(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function serializeUnknownForLog(value: unknown): unknown {
  if (value === null || typeof value === "undefined") return value;
  if (typeof value !== "object") return value;
  if (value instanceof Error) {
    const o: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    const maybe = value as ErrorWithSolanaMeta;
    if (maybe.transactionMessage !== undefined) {
      o.transactionMessage =
        typeof maybe.transactionMessage === "string"
          ? maybe.transactionMessage
          : stringifyUnknown(maybe.transactionMessage);
    }
    if (Array.isArray(maybe.transactionLogs)) {
      o.transactionLogs = maybe.transactionLogs;
    }
    return o;
  }
  try {
    return JSON.parse(
      JSON.stringify(value, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    );
  } catch {
    return { _coerced: String(value) };
  }
}

export function lamportsToSol(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const frac = (lamports % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

// Lamports held and needed at the step where a System Program transfer ran out of SOL.
export function parseInsufficientLamports(text: string): { have: bigint; need: bigint } | null {
  const m = text.match(/insufficient lamports (\d+), need (\d+)/);
  return m ? { have: BigInt(m[1]), need: BigInt(m[2]) } : null;
}

// Readable text for a System Program "insufficient lamports" failure found in a message or its logs.
export function insufficientSolMessage(text: string): string | null {
  const parsed = parseInsufficientLamports(text);
  if (!parsed) return null;
  const { have, need } = parsed;
  const short = need > have ? need - have : 0n;
  return (
    `Not enough SOL. This step needs ${lamportsToSol(need)} SOL, but only ${lamportsToSol(have)} SOL ` +
    `is left after network fees and account setup. Add at least ${lamportsToSol(short)} SOL ` +
    `or use a smaller amount.`
  );
}

function errorHasGetLogs(e: unknown): e is SendTransactionError {
  return (
    e instanceof Error &&
    e.name === "SendTransactionError" &&
    typeof (e as { getLogs?: unknown }).getLogs === "function"
  );
}

function errorIsSolanaJsonRpc(e: unknown): e is SolanaJSONRPCError {
  return e instanceof Error && e.name === "SolanaJSONRPCError";
}

// - Plain `{ message }` / `{ error: { message, issues } }` rejects

export function messageFromUnknown(e: unknown): string {
  if (e instanceof Error) {
    const ex = e as ErrorWithSolanaMeta;
    const rawMsg = ex.message;
    const noSol = insufficientSolMessage(`${rawMsg}\n${(ex.transactionLogs ?? []).join("\n")}`);
    if (noSol) return noSol;
    if (ex.name === "SendTransactionError" && typeof rawMsg === "string" && rawMsg.length > 0) {
      return rawMsg;
    }
    const tm = ex.transactionMessage;
    const logs = ex.transactionLogs;

    const tmStr =
      tm === undefined
        ? ""
        : typeof tm === "string"
          ? tm
          : stringifyUnknown(tm);

    const badMessage =
      rawMsg === "[object Object]" ||
      (typeof rawMsg === "string" && rawMsg.includes("[object Object]"));

    if (badMessage || (tm !== undefined && typeof tm === "object")) {
      const logBlock =
        Array.isArray(logs) && logs.length
          ? `\nLogs:\n${logs.slice(-25).join("\n")}`
          : "";
      const head = tmStr.trim() || "Transaction failed";
      return `${head}${logBlock}`;
    }

    if (typeof rawMsg === "string" && rawMsg.trim()) return rawMsg;

    if (Array.isArray(logs) && logs.length) {
      return logs.slice(-25).join("\n");
    }

    if (ex.cause !== undefined) {
      const c = messageFromUnknown(ex.cause);
      if (c.trim()) return c;
    }

    return rawMsg?.trim() || ex.name || "Error";
  }

  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const m = o.message;
    if (typeof m === "string" && m.trim() && m !== "[object Object]") {
      return m;
    }
    const inner = o.error;
    if (typeof inner === "string" && inner.trim()) return inner;
    if (inner && typeof inner === "object") {
      const io = inner as Record<string, unknown>;
      if (typeof io.message === "string" && io.message.trim()) {
        return io.message;
      }
      const issues = io.issues;
      if (Array.isArray(issues)) {
        const parts = issues
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const im = (item as { message?: unknown }).message;
            return typeof im === "string" ? im : null;
          })
          .filter((s): s is string => !!s);
        if (parts.length) return parts.join("; ");
      }
    }
    return stringifyUnknown(e);
  }
  return String(e);
}

export async function detailedTransactionFailureMessage(
  e: unknown,
  rpcConnection: Connection | null,
): Promise<string> {
  if (errorHasGetLogs(e)) {
    const ste = e;
    const noSol = insufficientSolMessage(`${ste.message}\n${(ste.logs ?? []).join("\n")}`);
    if (noSol) return noSol;
    let lines: string[] = [];
    if (rpcConnection) {
      try {
        lines = await ste.getLogs(rpcConnection);
      } catch {
        lines = ste.logs ?? [];
      }
    } else {
      lines = ste.logs ?? [];
    }
    const logBlock =
      lines.length > 0
        ? `\n\nProgram logs (last ${lines.length} lines):\n${lines.join("\n")}`
        : "";
    return `${ste.message}${logBlock}`;
  }

  if (errorIsSolanaJsonRpc(e)) {
    const j = e;
    const dataStr =
      j.data !== undefined ? `\nRPC data: ${stringifyUnknown(j.data)}` : "";
    return `${j.message}\nRPC code: ${String(j.code)}${dataStr}`;
  }

  return messageFromUnknown(e);
}
