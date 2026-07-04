import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import * as msg from "../messaging";
import { useWalletStore } from "../store";
import { cn } from "@/lib/utils";
import { useCopyToClipboard } from "../lib/useCopyToClipboard";
import { ArrowLeftIcon, CopyIcon } from "@/components/Icons";

// In-page step change only (shell already slides R→L via MainShell `accountSubpage`).

const stepCrossfade = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

export function PrivateKey() {
  const { accountId: rawId } = useParams<{ accountId: string }>();
  const accountId = rawId ? decodeURIComponent(rawId) : "";
  const navigate = useNavigate();
  const { state } = useWalletStore();

  const acc = useMemo(
    () => state?.accounts.find((a) => a.id === accountId),
    [state?.accounts, accountId],
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const { copied, copy } = useCopyToClipboard(secret, { ms: 1500 });

  const isActive = acc && state && acc.id === state.activeAccountId;

  async function reveal() {
    if (!isActive) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await msg.exportSecret();
      setSecret(r.secretKeyBase64);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not export key");
    } finally {
      setBusy(false);
    }
  }

  async function copySecret() {
    const ok = await copy();
    if (!ok) setErr("Could not copy to clipboard");
  }

  if (!state || !acc) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-24 pt-4">
        <p className="text-sm text-muted-foreground">
          Account not found.{" "}
          <Link to="/accounts" className="text-primary underline">
            Back
          </Link>
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex min-h-full flex-1 flex-col gap-4 bg-background px-4 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-2">
        <Link
          to={`/accounts/${encodeURIComponent(acc.id)}/edit`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "shrink-0 text-muted-foreground",
          )}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-[22px]" />
        </Link>
        <h1 className="flex-1 pr-8 text-center text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Your Private Key
        </h1>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3.5 text-center">
        <p className="text-[15px] font-bold leading-snug text-amber-600 dark:text-amber-400">
          Do not share your Private Key
        </p>
        <p className="mt-2 text-xs font-normal leading-relaxed text-amber-600/80 dark:text-amber-400/80">
          If someone has your Private Key they will have full control of your
          wallet.
        </p>
      </div>

      {!isActive ? (
        <p className="text-center text-sm text-muted-foreground">
          Switch to this account from Manage accounts, then open this screen
          again to export its key.
        </p>
      ) : null}

      {isActive && !secret ? (
        <motion.div
          key="private-key-reveal-prompt"
          className="flex w-full min-w-0 flex-col gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={stepCrossfade}
        >
          {err ? <p className="text-xs text-destructive">{err}</p> : null}
          <Button
            type="button"
            className="h-12 rounded-2xl text-[15px]"
            disabled={busy}
            onClick={() => void reveal()}
          >
            {busy ? "…" : "Reveal private key"}
          </Button>
        </motion.div>
      ) : null}

      {isActive && secret ? (
        <motion.div
          key="private-key-revealed"
          className="flex w-full min-w-0 flex-col gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={stepCrossfade}
        >
          <div className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/40 ring-1 ring-border/50">
            <div className="px-4 py-4 text-center font-mono text-[20px] leading-snug tracking-wide text-foreground [overflow-wrap:anywhere] break-all hyphens-none">
              {secret}
            </div>
            <div className="shrink-0 border-t border-border/70">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 py-3.5 text-[15px] font-medium text-foreground transition-colors hover:bg-muted/40"
                onClick={() => void copySecret()}
              >
                {copied ? (
                  <Check className="h-5 w-5 text-[color:var(--extension-success)]" strokeWidth={2} />
                ) : (
                  <CopyIcon className="size-5" />
                )}
                Copy
              </button>
            </div>
          </div>
          {err ? <p className="text-xs text-destructive">{err}</p> : null}
        </motion.div>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        className="mt-auto h-12 w-full rounded-2xl text-[15px] font-medium"
        onClick={() =>
          navigate(`/accounts/${encodeURIComponent(acc.id)}/edit`, {
            replace: true,
          })
        }
      >
        Done
      </Button>
    </motion.div>
  );
}
