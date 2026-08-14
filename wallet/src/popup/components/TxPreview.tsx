import {
  PublicKey,
  SystemInstruction,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { base64ToBytes } from "@/shared/crypto";
import { SOL_BASE_UNITS_PER_SOL, SYSTEM_PROGRAM_ID } from "@/shared/constants";

function tryParseTx(b64: string): Transaction | VersionedTransaction | null {
  try {
    const bytes = base64ToBytes(b64);
    try {
      return VersionedTransaction.deserialize(bytes);
    } catch {
      return Transaction.from(bytes);
    }
  } catch {
    return null;
  }
}

export function TxPreview({ serializedBase64 }: { serializedBase64: string }) {
  const tx = tryParseTx(serializedBase64);
  if (!tx) {
    return (
      <p className="text-xs text-amber-400/90">
        Could not parse transaction. Review carefully before signing.
      </p>
    );
  }

  if (tx instanceof VersionedTransaction) {
    const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
    const feePayer = keys[0] ?? "-";
    return (
      <div className="space-y-2 text-xs text-foreground">
        <p>
          <span className="text-muted-foreground">Type:</span> versioned message
        </p>
        <p className="break-all">
          <span className="text-muted-foreground">Fee payer:</span> {feePayer}
        </p>
        <p>
          <span className="text-muted-foreground">Instructions:</span>{" "}
          {tx.message.compiledInstructions.length}
        </p>
        <p className="text-muted-foreground">
          Full simulation is not wired in v1 - approve only if you trust this
          site.
        </p>
      </div>
    );
  }

  const sys = new PublicKey(SYSTEM_PROGRAM_ID);
  const transfers = tx.instructions
    .filter((ix) => ix.programId.equals(sys))
    .map((ix) => {
      try {
        const decoded = SystemInstruction.decodeTransfer(ix);
        const sol =
          Number(decoded.lamports) / Number(SOL_BASE_UNITS_PER_SOL);
        return {
          from: decoded.fromPubkey.toBase58(),
          to: decoded.toPubkey.toBase58(),
          sol,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as { from: string; to: string; sol: number }[];

  return (
    <div className="space-y-3 text-xs text-foreground">
      {transfers.length === 0 ? (
        <p className="text-muted-foreground">
          Non-system or complex transaction - preview limited.
        </p>
      ) : (
        transfers.map((t, i) => (
          <div key={i} className="rounded-xl bg-secondary p-3 ring-1 ring-border/60">
            <p className="font-semibold text-primary">SOL transfer</p>
            <p className="mt-1 text-muted-foreground">Amount</p>
            <p className="text-base font-medium text-foreground">{t.sol} SOL</p>
            <p className="mt-2 break-all text-[11px] text-muted-foreground">
              To: {t.to}
            </p>
          </div>
        ))
      )}
      <p className="text-[11px] text-muted-foreground/80">
        Fee payer: {tx.feePayer?.toBase58() ?? "-"}
      </p>
    </div>
  );
}
