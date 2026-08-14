import "@/polyfills";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

const TO_CONTENT = "brume_to_content";
const FROM_CONTENT = "brume_from_content";

function u8ToB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i++) {
    s += String.fromCharCode(u8[i]!);
  }
  return btoa(s);
}

function b64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error & { code?: number }) => void;
}

const pending = new Map<string, Pending>();

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const d = ev.data as {
    channel?: string;
    requestId?: string;
    ok?: boolean;
    result?: unknown;
    error?: { code: number; message: string };
  };
  if (d.channel !== FROM_CONTENT || !d.requestId) return;
  const p = pending.get(d.requestId);
  if (!p) return;
  pending.delete(d.requestId);
  if (d.ok) {
    p.resolve(d.result);
  } else {
    const err = new Error(d.error?.message ?? "Rejected") as Error & {
      code?: number;
    };
    err.code = d.error?.code;
    p.reject(err);
  }
});

function post(
  method: string,
  extra?: Record<string, unknown>,
): Promise<unknown> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    window.postMessage(
      { channel: TO_CONTENT, requestId, method, ...extra },
      "*",
    );
  });
}

function pkObj(b58: string) {
  return {
    toBase58: () => b58,
    toString: () => b58,
    toJSON: () => b58,
    equals: (o: { toBase58(): string }) => o.toBase58() === b58,
  };
}

type Pk = ReturnType<typeof pkObj>;

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

function on(ev: string, fn: (...args: unknown[]) => void): () => void {
  if (!listeners.has(ev)) listeners.set(ev, new Set());
  listeners.get(ev)!.add(fn);
  return () => off(ev, fn);
}

function off(ev: string, fn: (...args: unknown[]) => void): void {
  listeners.get(ev)?.delete(fn);
}

function emit(ev: string, ...args: unknown[]): void {
  listeners.get(ev)?.forEach((fn) => {
    try {
      fn(...args);
    } catch {
            // ignore

    }
  });
}

function deserializeSigned(b64: string): Transaction | VersionedTransaction {
  const bytes = b64ToU8(b64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

const brume = {
  isBrume: true,
  publicKey: null as Pk | null,

  async connect(): Promise<{ publicKey: Pk }> {
    const res = (await post("connect")) as { publicKey: string };
    brume.publicKey = pkObj(res.publicKey);
    emit("connect", brume.publicKey);
    return { publicKey: brume.publicKey };
  },

  async disconnect(): Promise<void> {
    await post("disconnect");
    brume.publicKey = null;
    emit("disconnect");
  },

  async signTransaction(
    tx: Transaction | VersionedTransaction,
  ): Promise<Transaction | VersionedTransaction> {
    const bytes =
      tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize();
    const out = (await post("signTransaction", {
      serializedTransaction: u8ToB64(bytes),
    })) as { signedTransaction: string };
    return deserializeSigned(out.signedTransaction);
  },

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> {
    const serializedTransactions = txs.map((tx) =>
      u8ToB64(tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize()),
    );
    const out = (await post("signAllTransactions", {
      serializedTransactions,
    })) as { signedTransactions: string[] };
    return out.signedTransactions.map((b64) => deserializeSigned(b64)) as T[];
  },

  async signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }> {
    const out = (await post("signMessage", {
      message: u8ToB64(message),
    })) as { signature: string };
    return { signature: b64ToU8(out.signature) };
  },

  on,
  off,
};

declare global {
  interface Window {
    brume?: typeof brume;
    solana?: typeof brume;
  }
}

window.brume = brume;
try {
  window.solana = brume;
} catch {

}
