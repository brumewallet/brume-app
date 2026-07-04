import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { PasswordInput } from "../components/PasswordInput";
import { requestUnlockConfetti } from "../components/UnlockConfettiHost";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

function BrumeLogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1000 1000"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M200 332.046C200 265.747 253.726 212 320 212H484.36V320.316C477.732 387.043 427.038 440.813 361.773 452.141C355.696 453.196 351 458.31 351 464.481V473.992C351 480.163 355.696 485.276 361.773 486.331C423.486 497.044 472.171 545.703 482.892 607.382C483.948 613.461 489.06 618.157 495.228 618.157H504.77C510.937 618.157 516.049 613.461 517.105 607.382C527.826 545.703 576.513 497.044 638.227 486.331C644.304 485.276 649 480.163 649 473.992V464.481C649 458.31 644.304 453.196 638.227 452.141C572.961 440.813 522.265 387.043 515.637 320.316V212H680C746.274 212 800 265.747 800 332.046V547.908C800 588.045 779.948 625.528 746.564 647.792L566.564 767.838C526.257 794.721 473.743 794.721 433.436 767.838L253.437 647.792C220.053 625.528 200 588.046 200 547.908V332.046Z"
        fill="currentColor"
      />
    </svg>
  );
}

const spring = [0.32, 0.72, 0, 1] as const;

export function Unlock() {
  const refresh = useWalletStore((s) => s.refresh);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!err) return;
    setShake(true);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }, [err]);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      await msg.unlock(password);
      requestUnlockConfetti();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unlock failed");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto overflow-hidden bg-background px-5 py-6">

      <div className="relative flex w-full max-w-[300px] flex-col items-center">
        <motion.div
          className="mb-8 flex items-center justify-center text-primary"
          initial={{ opacity: 0, scale: 0.80 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: spring }}
        >
          <BrumeLogoMark size={72} />
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: spring, delay: 0.1 }}
        >
          <p
            className="text-[16px] font-semibold text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Welcome back
          </p>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Enter your password to unlock
          </p>
        </motion.div>

        <motion.form
          className="mt-8 w-full"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: spring, delay: 0.18 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="unlock-password" className="sr-only">
                Password
              </FieldLabel>
              <div
                className={`w-full ${shake ? "brume-pin-shake rounded-2xl" : "rounded-2xl"}`}
              >
                <PasswordInput
                  id="unlock-password"
                  name="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Password"
                  autoFocus
                  className="text-center"
                />
              </div>
              {err ? (
                <FieldError className="text-center text-[13px] leading-4 text-destructive">
                  {err}
                </FieldError>
              ) : null}
            </Field>
            <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15, ease: spring }}>
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full rounded-2xl text-[15px] font-medium"
                disabled={busy || !password}
              >
                {busy ? "Unlocking…" : "Unlock"}
              </Button>
            </motion.div>
          </FieldGroup>
        </motion.form>

        <motion.p
          className="mt-8 text-center text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: spring, delay: 0.28 }}
        >
          <span className="cursor-default opacity-60">Forgot password</span>
        </motion.p>
      </div>
    </div>
  );
}
