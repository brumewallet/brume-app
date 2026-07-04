import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { parseSecretKeyImportInput } from "@/shared/wallet-core";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { PasswordInput } from "../components/PasswordInput";
import { cn } from "@/lib/utils";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

const spring = { type: "spring", stiffness: 260, damping: 20 } as const;

export function ImportPrivateKey() {
  const navigate = useNavigate();
  const location = useLocation();
  const addAccountFlow = location.pathname.startsWith("/accounts/");
  const refresh = useWalletStore((s) => s.refresh);

  const [step, setStep] = useState<"key" | "password">("key");
  const [secretInput, setSecretInput] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalSteps = addAccountFlow ? 1 : 2;
  const stepIndex = step === "key" ? 0 : 1;

  const backTo = addAccountFlow ? "/accounts/import-options" : "/import-options";

  function goNext() {
    setErr(null);
    try {
      parseSecretKeyImportInput(secretInput);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid private key");
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
      await msg.importPrivateKey(secretInput, addAccountFlow ? undefined : password);
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      className="flex min-h-[600px] flex-col gap-4 bg-background p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <Link
        to={step === "password" ? "#" : backTo}
        onClick={step === "password" ? (e) => { e.preventDefault(); setStep("key"); setErr(null); } : undefined}
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
        {step === "key" && (
          <motion.div
            key="key"
            className="flex flex-col gap-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={spring}
          >
            <div>
              <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                Private key
              </h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Base58 (Phantom), base64, hex, or JSON byte array all work.
              </p>
            </div>

            <Textarea
              id="import-sk"
              name="secretKey"
              className="min-h-[120px] rounded-2xl px-4 py-3 font-mono text-[13px] leading-relaxed"
              placeholder="Paste your private key"
              value={secretInput}
              onChange={(e) => setSecretInput(e.target.value)}
              spellCheck={false}
              autoComplete="off"
            />

            {err ? <FieldError>{err}</FieldError> : null}

            <Button
              type="button"
              className="h-12 w-full rounded-2xl text-[15px]"
              disabled={!secretInput.trim() || busy}
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
                id="import-pk-pw"
                name="password"
                value={password}
                onChange={setPassword}
              />
              <PasswordInput
                id="import-pk-pw2"
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
