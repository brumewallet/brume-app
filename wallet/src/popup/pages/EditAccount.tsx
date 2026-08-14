import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { truncateMiddle } from "../lib/format";
import * as msg from "../messaging";
import { useWalletStore } from "../store";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@/components/Icons";

export function EditAccount() {
  const { accountId: rawId } = useParams<{ accountId: string }>();
  const accountId = rawId ? decodeURIComponent(rawId) : "";
  const navigate = useNavigate();
  const { state, refresh } = useWalletStore();
  const acc = useMemo(
    () => state?.accounts.find((a) => a.id === accountId),
    [state?.accounts, accountId],
  );

  const [label, setLabel] = useState(acc?.label ?? "");

  useEffect(() => {
    if (acc) setLabel(acc.label);
  }, [accountId, acc?.id]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);

  if (!state || !acc) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Account not found.{" "}
        <Link to="/accounts" className="text-primary underline">
          Back
        </Link>
      </div>
    );
  }

  async function saveName() {
    if (!acc) return;
    setErr(null);
    const t = label.trim().slice(0, 32);
    setSaving(true);
    try {
      await msg.renameAccount(acc.id, t);
      await refresh();
      const fresh = useWalletStore.getState().state?.accounts.find(
        (x) => x.id === acc.id,
      );
      if (fresh) setLabel(fresh.label);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function doRemove() {
    if (!state || !acc) return;
    const wasLast = state.accounts.length === 1;
    const wasActive = acc.id === state.activeAccountId;
    setRemoveBusy(true);
    try {
      await msg.removeAccount(acc.id);
      await refresh();
      if (wasLast) navigate("/welcome", { replace: true });
      else if (wasActive) navigate("/", { replace: true });
      else navigate("/accounts", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <motion.div
      className="flex flex-col gap-5 px-4 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-2">
        <Link
          to="/accounts"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "shrink-0 text-muted-foreground",
          )}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-[22px]" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-semibold text-foreground pr-8" style={{ fontFamily: "var(--font-display)" }}>
          Edit account
        </h1>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-2xl font-bold text-primary">
          {(
            label.trim().charAt(0) ||
            acc.address.charAt(0) ||
            "?"
          ).toUpperCase()}
        </div>
      </div>

      <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 p-4">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="acct-name" className="text-xs">
              Account name
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="acct-name"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="h-10 rounded-xl"
                maxLength={32}
              />
              <Button
                type="button"
                size="sm"
                className="h-10 shrink-0 rounded-xl"
                disabled={
                  saving || label.trim().slice(0, 32) === acc.label.trim()
                }
                onClick={() => void saveName()}
              >
                Save
              </Button>
            </div>
            {err ? <FieldError>{err}</FieldError> : null}
          </Field>
          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Account address</p>
            <p className="mt-1 font-mono text-[13px] text-foreground">
              {truncateMiddle(acc.address, 6, 6)}
            </p>
          </div>
        </FieldGroup>
      </div>

      <Link
        to={`/accounts/${encodeURIComponent(acc.id)}/private-key`}
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "flex h-auto min-h-12 w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left no-underline ring-1 ring-border/60",
        )}
      >
        <span className="text-[15px] font-medium text-foreground">
          Show private key
        </span>
        <span className="text-muted-foreground">›</span>
      </Link>

      {removeConfirm ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-destructive/25 bg-destructive/8 p-4">
          <p className="text-[13px] leading-snug text-foreground">
            Remove this account? You can restore it later with your recovery phrase.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="h-10 flex-1 rounded-xl text-[14px]"
              onClick={() => setRemoveConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-10 flex-1 rounded-xl text-[14px]"
              disabled={removeBusy}
              onClick={() => void doRemove()}
            >
              {removeBusy ? "Removing…" : "Remove"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="h-12 w-full rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={removeBusy}
          onClick={() => setRemoveConfirm(true)}
        >
          Remove account
        </Button>
      )}
    </motion.div>
  );
}
