import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { Blockchain05Icon } from "@hugeicons/core-free-icons";
import { Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getNativeSolDisplay } from "@/lib/token-metadata";
import { formatTokenListAmount } from "@/lib/utils";
import { NETWORKS, SOL_WRAPPED_MINT, explorerMintUrl } from "@/shared/constants";
import { NetworkBanner } from "../components/NetworkBanner";
import { PageHeader } from "../components/PageHeader";
import { BrumeIcon } from "../components/BrumeIcon";
import { NATIVE_SOL_TOKEN_SEGMENT } from "../lib/native-sol-route";
import { scheduleWalletStateRefresh } from "../lib/schedule-wallet-state-refresh";
import { useCopyToClipboard } from "../lib/useCopyToClipboard";
import * as msg from "../messaging";
import { useWalletStore } from "../store";
import { cn } from "@/lib/utils";
import { CopyIcon, NavSendSolidIcon } from "@/components/Icons";
import { ArrowLeftRight } from "lucide-react";

function ellipsifyMint(mint: string, head = 4, tail = 4): string {
  const t = mint.replace(/\s/g, "");
  if (t.length <= head + tail + 1) return t;
  return `${t.slice(0, head)}…${t.slice(-tail)}`;
}

function InfoRow(props: {
  label: string;
  children: ReactNode;

  border?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-3.5",
        props.border !== false && "border-b border-border/50",
      )}
    >
      <span className="shrink-0 text-[15px] text-muted-foreground">
        {props.label}
      </span>
      <div className="min-w-0 text-right text-[15px] font-semibold text-foreground">
        {props.children}
      </div>
    </div>
  );
}

export function TokenDetail() {
  const { mint: mintParam = "" } = useParams<{ mint: string }>();
  const mint = useMemo(() => decodeURIComponent(mintParam), [mintParam]);
  const location = useLocation();
  const navigate = useNavigate();
  const { state, refresh } = useWalletStore();

  const isNativeSolDetail = mint === NATIVE_SOL_TOKEN_SEGMENT;

  const backTo =
    (location.state as { tokenDetailBackTo?: string } | null)
      ?.tokenDetailBackTo ?? "/";

  const row = useMemo(() => {
    if (isNativeSolDetail) return null;
    return state?.portfolioTokens?.find((t) => t.mint === mint) ?? null;
  }, [isNativeSolDetail, state?.portfolioTokens, mint]);

  const solDisplay = useMemo(
    () => (state ? getNativeSolDisplay(state.network) : null),
    [state?.network],
  );

  const [burnAmount, setBurnAmount] = useState("");
  const [wrapAmount, setWrapAmount] = useState("");
  const [busy, setBusy] = useState<null | "partial" | "all" | "unwrap" | "wrap">(null);
  const [err, setErr] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [burnConfirm, setBurnConfirm] = useState<
    null | { mode: "all" } | { mode: "partial"; amount: string }
  >(null);
  const [unwrapConfirm, setUnwrapConfirm] = useState(false);
  const [wrapConfirm, setWrapConfirm] = useState(false);

  const isWSOL = !isNativeSolDetail && mint === SOL_WRAPPED_MINT;

  const wsolRow = useMemo(
    () => state?.portfolioTokens?.find((t) => t.mint === SOL_WRAPPED_MINT) ?? null,
    [state?.portfolioTokens],
  );
  const wsolHumanBal = wsolRow
    ? Number(BigInt(wsolRow.amountRaw)) / 1e9
    : 0;

  const symbol = isNativeSolDetail
    ? (solDisplay?.symbol ?? "SOL")
    : (row?.symbol ??
      (mint.length > 5 ? `${mint.slice(0, 4)}…` : mint || "Token"));
  const name = isNativeSolDetail ? (solDisplay?.name ?? "Solana") : (row?.name ?? symbol);
  const logoUri = isNativeSolDetail
    ? (solDisplay?.logoURI ?? null)
    : (row?.logoUri ?? null);
  const decimals = isNativeSolDetail
    ? (solDisplay?.decimals ?? 9)
    : (row?.decimals ?? 9);
  const decimalsDisplay = String(decimals);

  const mintAddress = isNativeSolDetail ? SOL_WRAPPED_MINT : mint;
  const mintShort = ellipsifyMint(mintAddress);
  const { copied, copy } = useCopyToClipboard(mintAddress, { ms: 1500 });

  const humanBal = useMemo(() => {
    if (!state) return 0;
    if (isNativeSolDetail) {
      const raw = BigInt(state.balanceSolBaseUnits || "0");
      return Number(raw) / Number(10n ** BigInt(decimals));
    }
    if (!row?.amountRaw) return 0;
    const raw = BigInt(row.amountRaw);
    return Number(raw) / Number(10n ** BigInt(row.decimals));
  }, [isNativeSolDetail, state, row, decimals]);

  const unwrapHumanBal = isNativeSolDetail ? wsolHumanBal : humanBal;
  const showUnwrapAction =
    (isNativeSolDetail && wsolHumanBal > 0) || (isWSOL && humanBal > 0);

  useEffect(() => {
    if (!isNativeSolDetail || !state || state.locked) return;
    void msg.refreshBalanceFromChain().then(() => refresh());
  }, [isNativeSolDetail, state?.locked, refresh]);

  const net = state ? NETWORKS[state.network] : null;
  const explorerMint =
    state && net && mintAddress.length >= 32
      ? explorerMintUrl(state.explorerId, state.network, mintAddress)
      : null;

  async function copyMint() {
    await copy();
  }

  async function executeBurn(amount: string, mode: "partial" | "all") {
    await msg.burnSpl(mintAddress, amount);
    setErr(null);
    setBurnConfirm(null);
    if (mode === "all") {
      navigate(backTo, { replace: true });
    } else {
      setBurnAmount("");
      setSuccessMsg("Burn submitted.");
      window.setTimeout(() => setSuccessMsg(null), 5000);
    }
    scheduleWalletStateRefresh(refresh);
  }

  function openBurnAllDrawer() {
    if (humanBal <= 0) return;
    setErr(null);
    setBurnConfirm({ mode: "all" });
  }

  function openBurnPartialDrawer() {
    const a = burnAmount.trim();
    if (!a || humanBal <= 0) return;
    setErr(null);
    setBurnConfirm({ mode: "partial", amount: a });
  }

  async function confirmBurnInDrawer() {
    if (!burnConfirm) return;
    const payload = burnConfirm;
    const mode = payload.mode === "all" ? "all" : "partial";
    const amount = payload.mode === "all" ? "all" : payload.amount;
    setErr(null);
    setBusy(mode);
    try {
      await executeBurn(amount, mode);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Burn failed");
    } finally {
      setBusy(null);
    }
  }

  async function doUnwrap() {
    setErr(null);
    setBusy("unwrap");
    setUnwrapConfirm(false);
    try {
      await msg.unwrapSol();
      setSuccessMsg("Unwrapped. SOL returned to your wallet.");
      window.setTimeout(() => setSuccessMsg(null), 6000);
      scheduleWalletStateRefresh(refresh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unwrap failed");
    } finally {
      setBusy(null);
    }
  }

  async function doWrap() {
    const amt = wrapAmount.trim();
    setErr(null);
    setBusy("wrap");
    setWrapConfirm(false);
    try {
      await msg.wrapSol(amt);
      setWrapAmount("");
      setSuccessMsg("Wrapped. wSOL added to your wallet.");
      window.setTimeout(() => setSuccessMsg(null), 6000);
      scheduleWalletStateRefresh(refresh);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Wrap failed");
    } finally {
      setBusy(null);
    }
  }

  if (!state) return null;

  if (!isNativeSolDetail && !row && mint.length < 32) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <PageHeader title="Token" backTo={backTo} />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm text-muted-foreground">Unknown token.</p>
          <Link
            to={backTo}
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "text-sm",
            )}
          >
            Go back
          </Link>
        </div>
      </div>
    );
  }

  const burning = busy != null;
  const burnPartialDisabled =
    burning || !burnAmount.trim() || humanBal <= 0;
  const burnAllDisabled = burning || humanBal <= 0;

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <NetworkBanner network={state.network} />
      <PageHeader title={symbol} backTo={backTo} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3">
        <h2 className="mb-2 text-[15px] font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>Info</h2>
        <div className="rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 px-4">
          <div className="flex items-center gap-3 border-b border-border/50 py-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 ring-1 ring-primary/25">
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
                  size={32}
                  className="text-primary"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold leading-tight text-foreground">
                {name}
              </p>
            </div>
          </div>

          <InfoRow label="Symbol">{symbol}</InfoRow>
          <InfoRow label="Network">{net?.label ?? "-"}</InfoRow>
          <InfoRow label="Balance">
            <span className="tabular-nums">
              {formatTokenListAmount(humanBal)} {symbol}
            </span>
          </InfoRow>
          <InfoRow label="Decimals">{decimalsDisplay}</InfoRow>
          <InfoRow label="Mint" border={false}>
            <div className="flex max-w-full items-center justify-end gap-1.5">
              <span
                className="truncate font-mono text-[13px] font-semibold tracking-tight"
                title={mintAddress}
              >
                {mintShort}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Copy full mint address"
                onClick={() => void copyMint()}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-[color:var(--extension-success)]" strokeWidth={2} />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
          </InfoRow>
        </div>
        {explorerMint ? (
          <a
            href={explorerMint}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "mt-3 h-auto p-0 text-sm font-medium underline-offset-4",
            )}
          >
            View mint on explorer
          </a>
        ) : null}

        <div className="flex flex-col gap-2 pt-4">
          {busy === "unwrap" ? (
            <div
              className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-primary/55 text-[15px] font-semibold text-primary-foreground"
              aria-busy="true"
              aria-live="polite"
            >
              <Spinner className="size-5 text-primary-foreground" />
              Unwrapping…
            </div>
          ) : burning ? (
            <div
              className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-primary/55 text-[15px] font-semibold text-primary-foreground"
              aria-busy="true"
              aria-live="polite"
            >
              <Spinner className="size-5 text-primary-foreground" />
              Send
            </div>
          ) : isNativeSolDetail ? (
            <>
              <Link
                to="/send/sol"
                state={{
                  sendBackTo: `/token/${encodeURIComponent(NATIVE_SOL_TOKEN_SEGMENT)}`,
                }}
                className={cn(
                  buttonVariants({ variant: "default", size: "lg" }),
                  "h-12 w-full gap-2 rounded-2xl text-[15px] font-semibold no-underline",
                )}
              >
                <NavSendSolidIcon className="size-5 text-primary-foreground" />
                Send
              </Link>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="Amount to wrap"
                  value={wrapAmount}
                  onChange={(e) => setWrapAmount(e.target.value)}
                  className="h-11 flex-1 rounded-2xl text-[15px]"
                  autoComplete="off"
                  disabled={busy != null}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 shrink-0 gap-1.5 rounded-2xl px-4"
                  disabled={!wrapAmount.trim() || busy != null}
                  onClick={() => setWrapConfirm(true)}
                >
                  <ArrowLeftRight className="size-4" />
                  Wrap
                </Button>
              </div>
              {wsolHumanBal > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full gap-2 rounded-2xl text-[15px] font-medium"
                  disabled={busy != null}
                  onClick={() => setUnwrapConfirm(true)}
                >
                  <ArrowLeftRight className="size-4" />
                  Unwrap {wsolHumanBal.toLocaleString(undefined, { maximumFractionDigits: 4 })} wSOL to SOL
                </Button>
              ) : null}
            </>
          ) : (
            <Link
              to={`/send/spl/${encodeURIComponent(mint)}`}
              state={{ sendBackTo: `/token/${encodeURIComponent(mint)}` }}
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "h-12 w-full gap-2 rounded-2xl text-[15px] font-semibold no-underline",
              )}
            >
              <NavSendSolidIcon className="size-5 text-primary-foreground" />
              Send
            </Link>
          )}

          {showUnwrapAction && !isNativeSolDetail && !burning && busy !== "unwrap" ? (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full gap-2 rounded-2xl text-[15px] font-medium"
              onClick={() => setUnwrapConfirm(true)}
            >
              <ArrowLeftRight className="size-4" />
              Unwrap to SOL
            </Button>
          ) : null}
        </div>

        {successMsg ? (
          <p className="mt-4 text-center text-xs font-medium text-[color:var(--extension-success)]">
            {successMsg}
          </p>
        ) : null}
        {err ? (
          <p className="mt-4 text-center text-xs text-destructive">{err}</p>
        ) : null}
      </div>

      {!isNativeSolDetail ? (
        <>
          <div
            className="shrink-0 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-4 backdrop-blur-sm"
            aria-busy={burning}
          >
            <p className="mb-3 text-center text-[11px] font-medium text-muted-foreground">
              Burn tokens (irreversible)
            </p>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="burn-amt">Amount to burn</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="burn-amt"
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={burnAmount}
                    onChange={(e) => setBurnAmount(e.target.value)}
                    className="h-11 flex-1 rounded-2xl text-[15px]"
                    autoComplete="off"
                    disabled={burning}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 shrink-0 gap-2 rounded-2xl px-4"
                    disabled={burnPartialDisabled}
                    onClick={() => openBurnPartialDrawer()}
                  >
                    {busy === "partial" ? (
                      <>
                        <Spinner className="size-4" />
                        Burning
                      </>
                    ) : (
                      "Burn"
                    )}
                  </Button>
                </div>
              </Field>
            </FieldGroup>
            <Button
              type="button"
              variant="destructive"
              className="mt-3 h-11 w-full gap-2 rounded-2xl text-[15px] font-semibold"
              disabled={burnAllDisabled}
              onClick={() => openBurnAllDrawer()}
            >
              {busy === "all" ? (
                <>
                  <Spinner className="size-4" />
                  Burning…
                </>
              ) : (
                "Burn all & close account"
              )}
            </Button>
          </div>

          <Drawer
            open={burnConfirm != null}
            onOpenChange={(open) => {
              if (!open && !burning) setBurnConfirm(null);
            }}
          >
            <DrawerContent>
              <DrawerHeader className="text-left sm:text-left">
                <DrawerTitle>
                  {burnConfirm?.mode === "all"
                    ? "Burn entire balance?"
                    : "Burn tokens?"}
                </DrawerTitle>
                <DrawerDescription className="text-left">
                  {burnConfirm?.mode === "all" ? (
                    <>
                      Your full balance will be destroyed and this token account
                      will be closed. Rent returns to your wallet. This cannot be
                      undone.
                    </>
                  ) : burnConfirm?.mode === "partial" ? (
                    <>
                      Burn{" "}
                      <span className="font-medium text-foreground">
                        {burnConfirm.amount} {symbol}
                      </span>
                      ? This cannot be undone.
                    </>
                  ) : null}
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter className="flex-col gap-2 pt-2">
                {err != null && burnConfirm != null ? (
                  <p className="px-1 text-center text-sm text-destructive">
                    {err}
                  </p>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 w-full rounded-2xl"
                  disabled={burning}
                  onClick={() => setBurnConfirm(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  className="h-12 w-full gap-2 rounded-2xl"
                  disabled={burning}
                  onClick={() => void confirmBurnInDrawer()}
                >
                  {burning ? (
                    <>
                      <Spinner className="size-4" />
                      Burning…
                    </>
                  ) : (
                    "Burn"
                  )}
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </>
      ) : null}

      <Drawer open={wrapConfirm} onOpenChange={(open) => { if (!open) setWrapConfirm(false); }}>
        <DrawerContent>
          <DrawerHeader className="text-left sm:text-left">
            <DrawerTitle>Wrap SOL?</DrawerTitle>
            <DrawerDescription className="text-left">
              <span className="font-medium text-foreground">{wrapAmount} SOL</span>{" "}
              will be converted to Wrapped SOL (wSOL). You can unwrap it back at any time.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex-col gap-2 pt-2">
            <Button type="button" variant="outline" size="lg" className="h-12 w-full rounded-2xl" onClick={() => setWrapConfirm(false)}>
              Cancel
            </Button>
            <Button type="button" size="lg" className="h-12 w-full gap-2 rounded-2xl" onClick={() => void doWrap()}>
              <ArrowLeftRight className="size-4" />
              Wrap to wSOL
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer
        open={unwrapConfirm}
        onOpenChange={(open) => {
          if (!open) setUnwrapConfirm(false);
        }}
      >
        <DrawerContent>
          <DrawerHeader className="text-left sm:text-left">
            <DrawerTitle>Unwrap Wrapped SOL?</DrawerTitle>
            <DrawerDescription className="text-left">
              Your{" "}
              <span className="font-medium text-foreground">
                {formatTokenListAmount(unwrapHumanBal)} wSOL
              </span>{" "}
              will be converted back to native SOL. The token account will be closed
              and rent lamports returned to your wallet.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex-col gap-2 pt-2">
            {err != null && unwrapConfirm ? (
              <p className="px-1 text-center text-sm text-destructive">{err}</p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-2xl"
              disabled={busy === "unwrap"}
              onClick={() => setUnwrapConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-12 w-full gap-2 rounded-2xl"
              disabled={busy === "unwrap"}
              onClick={() => void doUnwrap()}
            >
              {busy === "unwrap" ? (
                <>
                  <Spinner className="size-4" />
                  Unwrapping…
                </>
              ) : (
                <>
                  <ArrowLeftRight className="size-4" />
                  Unwrap to SOL
                </>
              )}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </motion.div>
  );
}
