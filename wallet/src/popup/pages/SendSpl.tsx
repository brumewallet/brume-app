import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { getTokenListEntry } from "@/lib/token-metadata";
import { NETWORKS, isShieldFeatureEnabled } from "@/shared/constants";
import { messageFromUnknown } from "@/shared/errors";
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
import { ExtensionMascot } from "../components/ExtensionUxChrome";
import { PrivateLegAvatarBadge } from "../components/PrivateLegAvatarBadge";
import { scheduleWalletStateRefresh } from "../lib/schedule-wallet-state-refresh";
import { cn } from "@/lib/utils";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

function formatHumanBalance(amountRaw: string, decimals: number): number {
  const raw =
    amountRaw != null && amountRaw !== "" ? BigInt(amountRaw) : 0n;
  const divisor = 10n ** BigInt(decimals);
  return Number(raw) / Number(divisor);
}

type Phase = "form" | "sending" | "error";

export function SendSpl() {
  const { mint = "" } = useParams<{ mint: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = location.state as {
    sendBackTo?: string;
    fromPrivateBalance?: boolean;
  } | null;
  const sendBackTo = nav?.sendBackTo ?? "/send";
  const fromPrivateBalance = nav?.fromPrivateBalance === true;

  const { state, refresh } = useWalletStore();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [shieldInfo, setShieldInfo] = useState<{
    decimals: number;
    privateBalanceRaw: string;
  } | null>(null);
  const [shieldLoadError, setShieldLoadError] = useState<string | null>(null);
  const [fadeKey, setFadeKey] = useState(0);

  const row = useMemo(
    () => state?.portfolioTokens?.find((t) => t.mint === mint) ?? null,
    [state?.portfolioTokens, mint],
  );

  const listEntry = useMemo(() => {
    if (!state || mint.length < 32) return null;
    return getTokenListEntry(mint, state.network);
  }, [state, mint]);

  useEffect(() => {
    if (
      state &&
      fromPrivateBalance &&
      !isShieldFeatureEnabled(state.network)
    ) {
      navigate(sendBackTo, { replace: true });
    }
  }, [state, fromPrivateBalance, navigate, sendBackTo]);

  useEffect(() => {
    if (
      !fromPrivateBalance ||
      mint.length < 32 ||
      !state ||
      !isShieldFeatureEnabled(state.network)
    ) {
      setShieldInfo(null);
      setShieldLoadError(null);
      return;
    }
    setShieldLoadError(null);
    let cancelled = false;
    void msg
      .getShieldBalances(mint)
      .then((info) => {
        if (!cancelled) {
          setShieldInfo({
            decimals: info.decimals,
            privateBalanceRaw: info.privateBalanceRaw,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setShieldInfo(null);
          setShieldLoadError(
            e instanceof Error ? e.message : "Could not load shielded balance",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fromPrivateBalance, mint, state]);

  const decimals = fromPrivateBalance
    ? (shieldInfo?.decimals ?? row?.decimals ?? listEntry?.decimals ?? 9)
    : (row?.decimals ?? listEntry?.decimals ?? 9);

  const symbol =
    row?.symbol ??
    listEntry?.symbol ??
    (mint.length > 5 ? `${mint.slice(0, 4)}…` : mint || "SPL");
  const logoUri = row?.logoUri ?? listEntry?.logoURI ?? null;

  const available = useMemo(() => {
    if (fromPrivateBalance) {
      return formatHumanBalance(
        shieldInfo?.privateBalanceRaw ?? "0",
        decimals,
      );
    }
    if (!row?.amountRaw) return 0;
    return formatHumanBalance(row.amountRaw, row.decimals);
  }, [fromPrivateBalance, shieldInfo, row, decimals]);

  const netLabel = state ? NETWORKS[state.network].label : "";

  if (!state) return null;

  async function onSend() {
    setErr(null);
    setPhase("sending");
    setFadeKey((k) => k + 1);
    try {
      const { signature } = await msg.sendSpl(mint, to.trim(), amount.trim(), {
        fromPrivateBalance: fromPrivateBalance ? true : undefined,
      });
      navigate(`/send/success?sig=${encodeURIComponent(signature)}`, {
        replace: true,
      });
      scheduleWalletStateRefresh(refresh);
    } catch (e) {
      setErr(messageFromUnknown(e));
      setPhase("error");
    }
  }

  function setMax() {
    setAmount(
      available > 0
        ? available.toFixed(Math.min(8, decimals)).replace(/\.?0+$/, "")
        : "0",
    );
  }

  const amtNum = Number.parseFloat(amount);
  const canSend =
    mint.length > 0 &&
    to.trim().length > 0 &&
    Number.isFinite(amtNum) &&
    amtNum > 0 &&
    phase === "form" &&
    (!fromPrivateBalance || (shieldInfo != null && !shieldLoadError));

  const title = fromPrivateBalance ? `Send shielded ${symbol}` : `Send ${symbol}`;

  const tokenImg =
    logoUri && !logoFailed ? (
      <img
        src={logoUri}
        alt=""
        className="size-16 rounded-full object-cover"
        onError={() => setLogoFailed(true)}
      />
    ) : (
      <div className="flex size-16 items-center justify-center rounded-full bg-card ring-1 ring-border">
        <BrumeIcon icon={Blockchain05Icon} size={32} className="text-foreground" />
      </div>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <PageHeader title={title} backTo={sendBackTo} />

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
                <div className="relative h-[72px] w-[72px] shrink-0">
                  <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-card ring-1 ring-border">
                    {logoUri && !logoFailed ? (
                      <img
                        src={logoUri}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => setLogoFailed(true)}
                      />
                    ) : (
                      <BrumeIcon
                        icon={Blockchain05Icon}
                        size={40}
                        className="text-foreground"
                      />
                    )}
                  </div>
                  {fromPrivateBalance ? <PrivateLegAvatarBadge hero /> : null}
                </div>
              </div>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="spl-send-to">Recipient</FieldLabel>
                  <Input
                    id="spl-send-to"
                    name="recipient"
                    className="h-11 rounded-2xl border-0 bg-card px-4 text-[15px] shadow-none ring-1 ring-border"
                    placeholder={`Recipient's Solana ${netLabel} address`}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="spl-send-amount">Amount</FieldLabel>
                  <div className="relative">
                    <Input
                      id="spl-send-amount"
                      name="amount"
                      type="text"
                      inputMode="decimal"
                      className="h-11 rounded-2xl border-0 bg-card px-4 pr-28 text-[15px] shadow-none ring-1 ring-border"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      autoComplete="off"
                    />
                    <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                      <span className="max-w-[72px] truncate text-sm text-muted-foreground">
                        {symbol}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-normal text-primary hover:opacity-70"
                        onClick={setMax}
                      >
                        Max
                      </button>
                    </div>
                  </div>
                </Field>
              </FieldGroup>
              <div className="flex items-center justify-end text-xs text-muted-foreground">
                <span>
                  Available {available.toFixed(Math.min(8, decimals))} {symbol}
                  {fromPrivateBalance ? " (shielded)" : ""}
                </span>
              </div>
              {shieldLoadError ? (
                <p className="text-center text-xs text-destructive">
                  {shieldLoadError}
                </p>
              ) : null}
              {fromPrivateBalance ? (
                <p className="text-center text-[11px] text-muted-foreground">
                  Sends from your shielded balance on MagicBlock Payments
                  (ephemeral → ephemeral, private). The recipient receives on
                  their shielded balance.
                </p>
              ) : (
                <p className="text-center text-[11px] text-muted-foreground">
                  Wallet sends use MagicBlock private payments on base when
                  available, otherwise a standard SPL transfer.
                </p>
              )}
              {!state.simpleMode ? (
                <p className="text-[11px] text-muted-foreground/80">
                  Network fee paid in SOL (~0.000005 typical).
                </p>
              ) : null}
              <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="h-12 rounded-2xl text-[15px] font-normal"
                  onClick={() => navigate(sendBackTo)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-12 rounded-2xl text-[15px] font-normal"
                  disabled={!canSend}
                  onClick={() => void onSend()}
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
              <div className="flex items-center gap-4 py-2">
                {tokenImg}
                <ChevronRight
                  size={16}
                  className="shrink-0 text-muted-foreground brume-chevron-bounce"
                />
                <div className="flex size-16 items-center justify-center rounded-full bg-muted">
                  <BrumeIcon
                    icon={Blockchain05Icon}
                    size={28}
                    className="text-muted-foreground"
                  />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl font-semibold text-foreground">
                  {symbol} is on its way
                </p>
                <p className="mt-1 max-w-[280px] text-base text-muted-foreground">
                  Your transaction is being processed and will be completed
                  shortly
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
            <div className="border-t border-border px-5 pb-6 pt-4">
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
