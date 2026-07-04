import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  createMnemonic12,
  normalizeMnemonic,
} from "@/shared/wallet-core";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { PasswordInput } from "../components/PasswordInput";
import { SeedPhraseGrid } from "../components/SeedPhraseGrid";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

export function CreateWallet() {
  const navigate = useNavigate();
  const location = useLocation();
  const addAccountFlow = location.pathname.startsWith("/accounts/");
  const refresh = useWalletStore((s) => s.refresh);
  const mnemonic = useMemo(() => createMnemonic12(), []);
  const words = useMemo(
    () => normalizeMnemonic(mnemonic).split(" "),
    [mnemonic],
  );
  const [step, setStep] = useState<"show" | "verify" | "password">("show");
  const [shuffled, setShuffled] = useState<{ word: string; key: string }[]>(
    [],
  );
  const [order, setOrder] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function startVerify() {
    const deck = words.map((word, i) => ({
      word,
      key: `${i}-${word}`,
    }));
    deck.sort(() => Math.random() - 0.5);
    setShuffled(deck);
    setOrder([]);
    setStep("verify");
  }

  function tapToken(w: string) {
    setOrder((prev) => {
      const next = prev.filter((x) => x !== w);
      if (next.length === prev.length) {
        if (prev.length >= words.length) return prev;
        return [...prev, w];
      }
      return next;
    });
  }

  const verifyOk =
    order.length === words.length &&
    normalizeMnemonic(order.join(" ")) === normalizeMnemonic(mnemonic);

  async function finishAddAccount() {
    if (!addAccountFlow) return;
    setErr(null);
    setBusy(true);
    try {
      await msg.createWallet(mnemonic);
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setErr(null);
    if (password.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await msg.createWallet(mnemonic, password);
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = step === "show" ? 0 : step === "verify" ? 1 : 2;

  return (
    <motion.div
      className="flex min-h-[600px] flex-col gap-4 bg-background p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <Link
        to={addAccountFlow ? "/accounts/add" : "/welcome"}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit px-2 text-muted-foreground hover:text-foreground",
        )}
      >
        Back
      </Link>

      <div className="flex items-center gap-1.5 px-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-all duration-300",
              i <= stepIndex ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === "show" && (
          <motion.div
            key="show"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              {addAccountFlow ? "New account phrase" : "Backup phrase"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {addAccountFlow
                ? "This phrase is only for this new account. Store it safely. Adding the account uses your existing wallet password from this session."
                : "Write these words down. Anyone with them controls your funds."}
            </p>
            <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-4">
              <SeedPhraseGrid words={words} />
            </div>
            <Button
              type="button"
              className="mt-2 h-12 w-full rounded-2xl text-[15px]"
              onClick={startVerify}
            >
              I wrote them down
            </Button>
          </motion.div>
        )}
        {step === "verify" && (
          <motion.div
            key="verify"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>Verify order</h1>
            <p className="text-sm text-muted-foreground">
              Tap words in the same order as your backup sheet. Tap again to
              remove.
            </p>
            <div className="flex min-h-[48px] flex-wrap gap-2 rounded-2xl border border-dashed border-border bg-muted/20 p-2">
              {order.map((w, i) => (
                <span
                  key={`${i}-${w}`}
                  className="rounded-xl bg-muted/60 border border-border/50 px-3 py-2 text-xs text-primary"
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {shuffled.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => tapToken(t.word)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-medium transition-colors duration-150 active:scale-[0.97]",
                    order.includes(t.word)
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-card/60 text-foreground",
                  )}
                >
                  {t.word}
                </button>
              ))}
            </div>
            <Button
              type="button"
              disabled={!verifyOk || busy}
              className="mt-4 h-12 w-full rounded-2xl text-[15px] disabled:opacity-40"
              onClick={() => {
                if (addAccountFlow) void finishAddAccount();
                else setStep("password");
              }}
            >
              {addAccountFlow ? (busy ? "Adding…" : "Add account") : "Continue"}
            </Button>
          </motion.div>
        )}
        {step === "password" && (
          <motion.div
            key="password"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void finish();
              }}
            >
              <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                {addAccountFlow ? "Encrypt account" : "Encrypt wallet"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Password encrypts this account on this device (PBKDF2 + AES-GCM).
              </p>
              <div className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl p-4">
                <FieldGroup className="gap-3">
                  <Field>
                    <FieldLabel htmlFor="create-pw" className="sr-only">
                      Password
                    </FieldLabel>
                    <PasswordInput
                      id="create-pw"
                      name="password"
                      value={password}
                      onChange={setPassword}
                      placeholder="Password"
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="create-pw2" className="sr-only">
                      Confirm password
                    </FieldLabel>
                    <PasswordInput
                      id="create-pw2"
                      name="confirm"
                      value={confirm}
                      onChange={setConfirm}
                      placeholder="Confirm password"
                    />
                    {confirm.length > 0 && password !== confirm && (
                      <p className="text-[12px] text-muted-foreground/70">
                        Passwords don't match yet
                      </p>
                    )}
                  </Field>
                  {err ? <FieldError>{err}</FieldError> : null}
                </FieldGroup>
              </div>
              <Button
                type="submit"
                className="h-12 w-full rounded-2xl text-[15px]"
                disabled={busy}
              >
                {busy
                  ? addAccountFlow
                    ? "Adding…"
                    : "Creating…"
                  : addAccountFlow
                    ? "Add account"
                    : "Create wallet"}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
