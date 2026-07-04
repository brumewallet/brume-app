import { useMemo, useState } from "react";
import { getNativeSolDisplay } from "@/lib/token-metadata";
import { useLocation, useNavigate } from "react-router-dom";
import { NETWORKS, SOL_BASE_UNITS_PER_SOL } from "@/shared/constants";
import { Blockchain05Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "../components/PageHeader";
import { BrumeIcon } from "../components/BrumeIcon";
import {
  ExtensionMascot,
  ExtensionSendSpinner,
} from "../components/ExtensionUxChrome";
import { scheduleWalletStateRefresh } from "../lib/schedule-wallet-state-refresh";
import { cn } from "@/lib/utils";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

type Phase = "form" | "sending" | "error";

export function SendSol() {
  const navigate = useNavigate();
  const location = useLocation();
  const sendBackTo =
    (location.state as { sendBackTo?: string } | null)?.sendBackTo ?? "/send";
  const { state, refresh } = useWalletStore();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState<string | null>(null);
  const [solLogoFailed, setSolLogoFailed] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);

  const solList = useMemo(
    () => getNativeSolDisplay(state?.network ?? "devnet"),
    [state?.network],
  );

  const availableSol = useMemo(() => {
    if (!state?.balanceSolBaseUnits) return 0;
    const raw = BigInt(state.balanceSolBaseUnits);
    return Number(raw) / Number(SOL_BASE_UNITS_PER_SOL);
  }, [state?.balanceSolBaseUnits]);

  if (!state) return null;

  const netLabel = NETWORKS[state.network].label;

  async function sendSol() {
    setErr(null);
    setPhase("sending");
    setFadeKey((k) => k + 1);
    try {
      const { signature } = await msg.sendSol(to.trim(), amount);
      navigate(`/send/success?sig=${encodeURIComponent(signature)}`, {
        replace: true,
      });
      scheduleWalletStateRefresh(refresh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed");
      setPhase("error");
    }
  }

  function setMax() {
    const feeReserve = 0.00001;
    const m = Math.max(0, availableSol - feeReserve);
    setAmount(m > 0 ? m.toFixed(6).replace(/\.?0+$/, "") : "0");
  }

  const amtNum = Number.parseFloat(amount);
  const canSend =
    to.trim().length > 0 && Number.isFinite(amtNum) && amtNum > 0 && phase === "form";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <PageHeader title="Send SOL" backTo={sendBackTo} />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          key={fadeKey}
          className={cn(
            "brume-phase-crossfade flex min-h-0 flex-1 flex-col",
            phase === "form" ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {phase === "form" ? (
          <form
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-4"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="flex justify-center py-2">
              <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full bg-card ring-1 ring-border">
                {solList.logoURI && !solLogoFailed ? (
                  <img
                    src={solList.logoURI}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setSolLogoFailed(true)}
                  />
                ) : (
                  <BrumeIcon
                    icon={Blockchain05Icon}
                    size={40}
                    className="text-foreground"
                  />
                )}
              </div>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              SOL sends use MagicBlock private payments when available.
            </p>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="send-to">Recipient</FieldLabel>
                <Input
                  id="send-to"
                  name="recipient"
                  className="h-11 rounded-2xl border-0 bg-card px-4 text-[15px] shadow-none ring-1 ring-border"
                  placeholder={`Recipient's Solana ${netLabel} address`}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="send-amount">Amount</FieldLabel>
                <div className="relative">
                  <Input
                    id="send-amount"
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    className="h-11 rounded-2xl border-0 bg-card px-4 pr-24 text-[15px] shadow-none ring-1 ring-border"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoComplete="off"
                  />
                  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                    <span className="text-sm text-muted-foreground">SOL</span>
                    <button
                      type="button"
                      className="text-xs font-normal text-primary hover:opacity-70"
                      onClick={setMax}
                    >
                      Max
                    </button>
                  </div>
                </div>
              </Field>
            </FieldGroup>
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span>Available {availableSol.toFixed(5)} SOL</span>
            </div>
            {!state.simpleMode && (
              <p className="text-[11px] text-muted-foreground/80">
                Network fee paid in SOL (~0.000005 typical).
              </p>
            )}
            <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-12 rounded-2xl text-[15px] font-normal"
                onClick={() => navigate("/send")}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12 rounded-2xl text-[15px] font-normal"
                disabled={!canSend}
                onClick={() => void sendSol()}
              >
                Send
              </Button>
            </div>
          </form>
          ) : (
            <div className="min-h-0 flex-1" />
          )}
        </div>

        {phase === "sending" ? (
        <div className="absolute inset-0 z-[2] flex min-h-0 flex-col bg-background">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 py-6">
            <ExtensionSendSpinner />
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">SOL is on its way</p>
              <p className="mt-1 max-w-[280px] text-base text-muted-foreground">
                Your transaction is being processed and will be completed shortly
              </p>
            </div>
          </div>
          <div className="border-t border-border px-5 pb-6 pt-4">
            <Button
              type="button"
              size="lg"
              disabled
              className="h-12 w-full rounded-2xl bg-[var(--btn-disabled)] text-[15px] font-normal text-white opacity-100"
            >
              In progress…
            </Button>
          </div>
        </div>
        ) : null}

        {phase === "error" ? (
        <div className="absolute inset-0 z-[2] flex min-h-0 flex-col bg-background">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 py-6">
            <ExtensionMascot variant="error" />
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">Send failed</p>
              <p className="mt-1 max-w-[280px] text-base text-muted-foreground">
                {err ?? "Something went wrong. Please try again."}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-t border-border px-5 pb-6 pt-4">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full rounded-2xl text-[15px] font-normal"
              onClick={() => {
                setPhase("form");
                setFadeKey((k) => k + 1);
              }}
            >
              Try again
            </Button>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
