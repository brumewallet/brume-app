import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EarnState } from "@/background/earn-service";
import * as msg from "../messaging";
import { useWalletStore } from "../store";

const display = { fontFamily: "var(--font-display)" } as const;

// Raw USDC (6 decimals) to a short display string.
function usdc(raw: string | null | undefined): string {
  const n = Number(raw ?? "0") / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 1 && n > 0 ? 6 : 2 });
}

function rawToInput(raw: string): string {
  const v = BigInt(raw);
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function timeAgo(ms: number): string {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", muted ? "text-muted-foreground" : "text-foreground")}>{value}</span>
    </div>
  );
}

export function Earn() {
  const { state, refresh } = useWalletStore();
  const [earn, setEarn] = useState<EarnState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [floor, setFloor] = useState("100");
  const [cap, setCap] = useState("1000");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEarn(await msg.getEarnState());
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, state?.publicKey, state?.network]);

  async function run(label: string, f: () => Promise<unknown>, done: string) {
    setBusy(label);
    setErr(null);
    setNote(null);
    try {
      await f();
      setNote(done);
      setAmount("");
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!state) return null;
  const pos = earn?.position;
  const auto = earn?.autoEarn;
  const isMainnet = state.network === "mainnet-beta";
  const firstDeposit = pos != null && !pos.hasPolicy;
  const maxRaw = mode === "deposit" ? pos?.walletUsdcRaw : pos?.totalRaw;
  const apy = pos?.supplyApy != null ? `${(pos.supplyApy * 100).toFixed(2)}% APY` : null;

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <header className="flex items-baseline justify-between">
        <h1 className="text-[18px] font-semibold leading-7 text-foreground" style={display}>
          Earn
        </h1>
        {apy ? <span className="text-[13px] font-semibold text-primary">{apy}</span> : null}
      </header>

      <section className="rounded-2xl bg-card p-4">
        <p className="text-[12px] text-muted-foreground">USDC in Earn</p>
        <p className="mt-1 text-[26px] font-semibold tabular-nums text-foreground" style={display}>
          {pos ? usdc(pos.totalRaw) : "…"}
        </p>
        <div className="mt-3 border-t border-border pt-2">
          <Row label="Earned" value={pos?.earnedRaw != null ? `+${usdc(pos.earnedRaw)}` : "—"} />
          <Row label="Supplied to Kamino" value={usdc(pos?.suppliedRaw)} />
          <Row label="Waiting to be supplied" value={usdc(pos?.idleRaw)} muted />
          <Row label="USDC in wallet" value={usdc(pos?.walletUsdcRaw)} muted />
        </div>
        {loadErr ? <p className="mt-2 text-[11px] text-destructive">{loadErr}</p> : null}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
        <div className="flex gap-1 rounded-xl bg-secondary p-1">
          {(["deposit", "withdraw"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-lg py-2 text-[13px] font-medium capitalize transition-all",
                mode === m ? "bg-card text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-muted-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label={`${mode} amount in USDC`}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!maxRaw || maxRaw === "0"}
            onClick={() => setAmount(maxRaw ? rawToInput(maxRaw) : "")}
          >
            Max
          </Button>
        </div>
        {mode === "deposit" && firstDeposit ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The first deposit sets up your Earn account. It needs about 0.04 SOL of one-time account rent.
          </p>
        ) : null}
        <Button
          type="button"
          disabled={busy != null || amount.trim() === ""}
          onClick={() =>
            void run(
              mode,
              () =>
                mode === "deposit"
                  ? msg.earnDeposit(amount)
                  : msg.earnWithdraw(maxRaw && amount === rawToInput(maxRaw) ? "all" : amount),
              mode === "deposit" ? "Deposited to Earn." : "Withdrawn to your wallet.",
            )
          }
        >
          {busy === mode ? "Confirming…" : mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground" style={display}>
            Auto-earn
          </h2>
          <span className={cn("text-[12px] font-medium", auto?.enabled ? "text-primary" : "text-muted-foreground")}>
            {auto?.enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          A separate automation key moves USDC above your floor into Earn, up to your monthly limit. It can only move
          your USDC into your own Earn account; it cannot send funds anywhere else.
          {isMainnet ? "" : " Supplying to Kamino runs on Mainnet; on Devnet, swept USDC waits in Earn."}
        </p>

        {auto?.enabled ? (
          <>
            <div className="border-t border-border pt-2">
              <Row label="Keep in wallet" value={`${usdc(auto.floorRaw)} USDC`} />
              <Row label="Monthly limit" value={`${usdc(auto.perPeriodCapRaw)} USDC`} />
              <Row label="Left this month" value={`${usdc(auto.remainingRaw)} USDC`} muted />
              <Row label="Fee balance" value={`${(auto.automationLamports / 1e9).toFixed(4)} SOL`} muted />
              <Row
                label="Last run"
                value={
                  auto.lastRun
                    ? auto.lastRun.error
                      ? `Failed ${timeAgo(auto.lastRun.at)}`
                      : `${timeAgo(auto.lastRun.at)} · moved ${usdc(auto.lastRun.pulledRaw)}`
                    : "Not yet"
                }
                muted
              />
            </div>
            {auto.lastRun?.error ? <p className="text-[11px] text-destructive">{auto.lastRun.error}</p> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy != null}
                onClick={() => void run("sweep", msg.runAutoEarnNow, "Auto-earn ran.")}
              >
                {busy === "sweep" ? "Running…" : "Run now"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy != null}
                onClick={() => void run("off", msg.disableAutoEarn, "Auto-earn is off.")}
              >
                {busy === "off" ? "Turning off…" : "Turn off"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
              Keep in wallet (USDC)
              <Input inputMode="decimal" value={floor} onChange={(e) => setFloor(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
              Monthly limit (USDC)
              <Input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
            </label>
            <Button
              type="button"
              disabled={busy != null || cap.trim() === ""}
              onClick={() => void run("on", () => msg.enableAutoEarn(floor, cap), "Auto-earn is on.")}
            >
              {busy === "on" ? "Setting up…" : "Turn on auto-earn"}
            </Button>
          </>
        )}
      </section>

      {note ? <p className="text-center text-[12px] text-primary">{note}</p> : null}
      {err ? (
        <p className="text-center text-[12px] text-destructive" role="alert">
          {err}
        </p>
      ) : null}
    </motion.div>
  );
}
