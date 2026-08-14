

export interface UnsignedPaymentTransaction {
  kind: string;
  version: "legacy";
  transactionBase64: string;
  sendTo?: "base" | "ephemeral";
  recentBlockhash: string;
  lastValidBlockHeight: number;
  instructionCount: number;
  requiredSigners: string[];
  validator?: string;
}

function str(o: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const a = o[camel];
  const b = o[snake];
  if (typeof a === "string" && a) return a;
  if (typeof b === "string" && b) return b;
  return undefined;
}

function num(o: Record<string, unknown>, camel: string, snake: string): number | undefined {
  const a = o[camel];
  const b = o[snake];
  const v = a ?? b;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function strArr(o: Record<string, unknown>, camel: string, snake: string): string[] | undefined {
  const a = o[camel];
  const b = o[snake];
  const v = a ?? b;
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string");
  return out.length ? out : undefined;
}

export function normalizeUnsignedPaymentTransaction(
  data: unknown,
): UnsignedPaymentTransaction {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid unsigned transaction response");
  }
  const o = data as Record<string, unknown>;

  const transactionBase64 =
    str(o, "transactionBase64", "transaction_base64") ??
    (typeof o.transaction === "string" ? o.transaction : undefined);
  if (!transactionBase64) {
    throw new Error("Missing transactionBase64 in Payments API response");
  }

  const sendToRaw = o.sendTo ?? o.send_to;
  const sendTo: "base" | "ephemeral" | undefined =
    sendToRaw === "ephemeral" || sendToRaw === "base"
      ? sendToRaw
      : undefined;

  const recentBlockhash = str(o, "recentBlockhash", "recent_blockhash");
  if (!recentBlockhash) {
    throw new Error("Missing recentBlockhash in Payments API response");
  }

  const lastValidBlockHeight = num(o, "lastValidBlockHeight", "last_valid_block_height");
  if (lastValidBlockHeight == null) {
    throw new Error("Missing lastValidBlockHeight in Payments API response");
  }

  const instructionCount = num(o, "instructionCount", "instruction_count");
  if (instructionCount == null) {
    throw new Error("Missing instructionCount in Payments API response");
  }

  const requiredSigners =
    strArr(o, "requiredSigners", "required_signers") ?? [];

  const kind = typeof o.kind === "string" ? o.kind : "splTransfer";
  const version = o.version === "legacy" ? "legacy" : "legacy";
  const validator =
    typeof o.validator === "string" && o.validator.trim()
      ? o.validator.trim()
      : undefined;

  const out: UnsignedPaymentTransaction = {
    kind,
    version,
    transactionBase64,
    recentBlockhash,
    lastValidBlockHeight,
    instructionCount,
    requiredSigners,
  };
  if (sendTo) out.sendTo = sendTo;
  if (validator) out.validator = validator;
  return out;
}

export type InitializeMintUnsigned = UnsignedPaymentTransaction & {
  kind: "initializeMint";
  transferQueue: string;
  rentPda: string;
};

export function normalizeInitializeMintUnsigned(
  data: unknown,
): InitializeMintUnsigned {
  const base = normalizeUnsignedPaymentTransaction(data);
  const o = data as Record<string, unknown>;
  const transferQueue = str(o, "transferQueue", "transfer_queue");
  const rentPda = str(o, "rentPda", "rent_pda");
  if (!transferQueue || !rentPda) {
    throw new Error("Missing transferQueue or rentPda in initialize-mint response");
  }
  return {
    ...base,
    kind: "initializeMint",
    transferQueue,
    rentPda,
  };
}
