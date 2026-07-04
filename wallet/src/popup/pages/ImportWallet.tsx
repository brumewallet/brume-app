import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { validateMnemonicPhrase } from "@/shared/wallet-core";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { PasswordInput } from "../components/PasswordInput";
import { cn } from "@/lib/utils";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

const spring = { type: "spring", stiffness: 260, damping: 20 } as const;

function parseWords(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean);
}

function MnemonicInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const words = parseWords(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputVal, setInputVal] = useState("");

  function commitInput(raw: string) {
    const newWords = parseWords(raw);
    if (newWords.length === 0) return;
    const all = [...words, ...newWords];
    onChange(all.join(" "));
    setInputVal("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === " " || e.key === "," || e.key === "Enter") {
      e.preventDefault();
      commitInput(inputVal);
      return;
    }
    if (e.key === "Backspace" && inputVal === "" && words.length > 0) {
      const next = [...words];
      next.pop();
      onChange(next.join(" "));
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    commitInput(inputVal + " " + pasted);
  }

  function removeWord(idx: number) {
    const next = words.filter((_, i) => i !== idx);
    onChange(next.join(" "));
    inputRef.current?.focus();
  }

  return (
    <div
      className="flex min-h-[130px] flex-wrap content-start gap-1.5 rounded-2xl border border-border bg-input/40 p-3 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-card px-2.5 py-1 text-[13px] font-medium text-foreground"
        >
          <span className="text-[10px] font-normal text-muted-foreground/60 tabular-nums">
            {i + 1}
          </span>
          <span className="leading-none">{word}</span>
          <button
            type="button"
            className="ml-0.5 text-muted-foreground/50 hover:text-foreground leading-none"
            onClick={(e) => { e.stopPropagation(); removeWord(i); }}
            tabIndex={-1}
          >
            ×
          </button>
        </motion.span>
      ))}
      <input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => { if (inputVal.trim()) commitInput(inputVal); }}
        className="min-w-[80px] flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/50 outline-none"
        placeholder={words.length === 0 ? "Type or paste your recovery phrase…" : ""}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  );
}

export function ImportWallet() {
  const navigate = useNavigate();
  const location = useLocation();
  const addAccountFlow = location.pathname.startsWith("/accounts/");
  const refresh = useWalletStore((s) => s.refresh);

  const [step, setStep] = useState<"phrase" | "password">("phrase");
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const words = parseWords(phrase);
  const wordCount = words.length;
  const validCount = wordCount === 12 || wordCount === 24;

  const totalSteps = addAccountFlow ? 1 : 2;
  const stepIndex = step === "phrase" ? 0 : 1;

  function goNext() {
    setErr(null);
    const trimmed = words.join(" ");
    if (!validateMnemonicPhrase(trimmed)) {
      setErr("Invalid recovery phrase — check each word.");
      return;
    }
    if (addAccountFlow) {
      void doImport();
    } else {
      setStep("password");
    }
  }

  async function doImport() {
    setErr(null);
    if (!addAccountFlow) {
      if (password.length < 8) { setErr("Use at least 8 characters."); return; }
      if (password !== confirm) { setErr("Passwords do not match."); return; }
    }
    setBusy(true);
    try {
      await msg.importWallet(words.join(" "), addAccountFlow ? undefined : password);
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const backTo = addAccountFlow ? "/accounts/import-options" : "/import-options";

  return (
    <motion.div
      className="flex min-h-[600px] flex-col gap-4 bg-background p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <Link
        to={step === "password" ? "#" : backTo}
        onClick={step === "password" ? (e) => { e.preventDefault(); setStep("phrase"); setErr(null); } : undefined}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit px-2 text-muted-foreground hover:text-foreground",
        )}
      >
        Back
      </Link>

      {totalSteps > 1 && (
        <div className="flex items-center gap-1.5 px-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                i <= stepIndex ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === "phrase" && (
          <motion.div
            key="phrase"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={spring}
          >
            <div>
              <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Recovery phrase
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Enter your 12 or 24-word phrase. Type word by word or paste all at once.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <MnemonicInput value={phrase} onChange={setPhrase} />
              <p className={cn(
                "text-right text-[11px] tabular-nums",
                validCount ? "text-[var(--extension-success)]" : "text-muted-foreground/50",
              )}>
                {wordCount > 0 ? `${wordCount} / ${wordCount <= 12 ? "12" : "24"} words` : ""}
              </p>
            </div>

            {err ? <FieldError>{err}</FieldError> : null}

            <Button
              type="button"
              className="h-12 w-full rounded-2xl text-[15px]"
              disabled={!validCount || busy}
              onClick={goNext}
            >
              {addAccountFlow && busy ? "Importing…" : "Continue"}
            </Button>
          </motion.div>
        )}

        {step === "password" && (
          <motion.div
            key="password"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={spring}
          >
            <div>
              <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Set a password
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Protects your wallet on this device.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <PasswordInput
                id="import-pw"
                name="password"
                value={password}
                onChange={setPassword}
              />
              <PasswordInput
                id="import-pw2"
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
            </div>

            {err ? <FieldError>{err}</FieldError> : null}

            <Button
              type="button"
              className="h-12 w-full rounded-2xl text-[15px]"
              disabled={busy || !password || !confirm}
              onClick={() => void doImport()}
            >
              {busy ? "Importing…" : "Import wallet"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
