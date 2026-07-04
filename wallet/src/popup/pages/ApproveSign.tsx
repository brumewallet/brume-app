import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { SecurityCheckIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { BrumeIcon } from "../components/BrumeIcon";
import { TxPreview } from "../components/TxPreview";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

export function ApproveSign() {
  const navigate = useNavigate();
  const { state, refresh } = useWalletStore();
  const [busy, setBusy] = useState(false);

  const p = state?.pendingSign;

  async function approve() {
    if (!p) return;
    setBusy(true);
    try {
      await msg.approveSign(p.id);
      await refresh();
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!p) return;
    setBusy(true);
    try {
      await msg.rejectSign(p.id);
      await refresh();
      navigate("/", { replace: true });
    } finally {
      setBusy(false);
    }
  }

  if (!p) return null;

  return (
    <motion.div
      className="flex min-h-[600px] flex-col gap-4 bg-background p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/25">
          <BrumeIcon icon={SecurityCheckIcon} size={28} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Confirm transaction
          </h1>
          <p className="break-all text-[11px] text-muted-foreground">{p.origin}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-4">
        {p.kind === "transaction" && p.serializedTransaction && (
          <TxPreview serializedBase64={p.serializedTransaction} />
        )}
        {p.kind === "allTransactions" && (
          <p className="text-xs text-muted-foreground">
            Batch of {p.serializedTransactions?.length ?? 0} transactions.
            Approve only if you trust this site.
          </p>
        )}
        {p.kind === "message" && (
          <p className="text-xs text-muted-foreground">
            Sign message request. Used for authentication by some apps.
          </p>
        )}
      </div>
      <p className="text-[11px] text-amber-400/90">
        Review carefully. Simulation is limited in v1.
      </p>
      <div className="mt-auto grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="secondary"
          className="h-12 rounded-2xl text-[15px]"
          disabled={busy}
          onClick={() => void reject()}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="h-12 rounded-2xl text-[15px]"
          disabled={busy}
          onClick={() => void approve()}
        >
          Sign
        </Button>
      </div>
    </motion.div>
  );
}
