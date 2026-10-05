// Earn entry points for the background message handler and the auto-earn alarm.
import { PublicKey, type Keypair } from "@solana/web3.js";
import type { NetworkId } from "@/shared/constants";
import type { PriorityLevel } from "@/shared/priority-fee";
import type { PersistedVault } from "@/shared/types";
import { parseTokenAmount } from "./brume-vault";
import { earnDeposit, earnWithdraw, fetchEarnPosition, readEarnRecord, USDC_DECIMALS, type EarnPosition } from "./earn";
import { disableAutoEarn, enableAutoEarn, remainingAllowance, runAutoEarnSweep, type SweepResult } from "./earn-auto";
import { getConnection } from "./rpc";

export const AUTO_EARN_ALARM = "brume-auto-earn";
export const AUTO_EARN_INTERVAL_MINUTES = 15;
const STATUS_KEY = "brume_auto_earn_status_v1";

export type AutoEarnStatus = {
  enabled: boolean;
  floorRaw: string | null;
  perPeriodCapRaw: string | null;
  periodSeconds: string | null;
  remainingRaw: string | null;
  automationKey: string;
  automationLamports: number;
  lastRun: (SweepResult & { at: number; error?: string }) | null;
};

export type EarnState = { position: EarnPosition; autoEarn: AutoEarnStatus };

type Ctx = { network: NetworkId; rpcUrlOverride: string | null; priority?: PriorityLevel };

const usdcRaw = (amount: string) => parseTokenAmount(amount, USDC_DECIMALS);

async function readStatuses(): Promise<Record<string, SweepResult & { at: number; error?: string }>> {
  const raw = await chrome.storage.local.get(STATUS_KEY);
  const v = raw[STATUS_KEY];
  return v && typeof v === "object" ? (v as Record<string, SweepResult & { at: number; error?: string }>) : {};
}

async function writeStatus(network: NetworkId, owner: string, status: SweepResult & { at: number; error?: string }): Promise<void> {
  const all = await readStatuses();
  all[`${network}:${owner}`] = status;
  await chrome.storage.local.set({ [STATUS_KEY]: all });
}

export async function getEarnState(ctx: Ctx, owner: PublicKey): Promise<EarnState> {
  const conn = getConnection(ctx.network, ctx.rpcUrlOverride);
  const position = await fetchEarnPosition({ conn, network: ctx.network, owner });
  const rec = await readEarnRecord(ctx.network, owner);
  const auto = rec?.autodeposit;
  const automation = new PublicKey(position.automationKey);
  const [remaining, lamports] = await Promise.all([
    auto ? remainingAllowance(conn, new PublicKey(auto.recurringDelegation)) : Promise.resolve(null),
    conn.getBalance(automation, "confirmed"),
  ]);
  return {
    position,
    autoEarn: {
      enabled: auto?.enabled === true,
      floorRaw: auto?.floorRaw ?? null,
      perPeriodCapRaw: auto?.perPeriodCapRaw ?? null,
      periodSeconds: auto?.periodSeconds ?? null,
      remainingRaw: remaining?.toString() ?? null,
      automationKey: automation.toBase58(),
      automationLamports: lamports,
      lastRun: (await readStatuses())[`${ctx.network}:${owner.toBase58()}`] ?? null,
    },
  };
}

export async function deposit(ctx: Ctx, from: Keypair, amount: string) {
  const conn = getConnection(ctx.network, ctx.rpcUrlOverride);
  return earnDeposit({ conn, network: ctx.network, from, amountRaw: usdcRaw(amount), priority: ctx.priority });
}

export async function withdraw(ctx: Ctx, from: Keypair, amount: string | "all") {
  const conn = getConnection(ctx.network, ctx.rpcUrlOverride);
  return amount === "all"
    ? earnWithdraw({ conn, network: ctx.network, from, amountRaw: 0n, mode: "full", priority: ctx.priority })
    : earnWithdraw({ conn, network: ctx.network, from, amountRaw: usdcRaw(amount), mode: "partial", priority: ctx.priority });
}

export async function enableAuto(ctx: Ctx, from: Keypair, floor: string, monthlyCap: string) {
  const conn = getConnection(ctx.network, ctx.rpcUrlOverride);
  const floorRaw = floor.trim() === "" || floor.trim() === "0" ? 0n : usdcRaw(floor);
  return enableAutoEarn({ conn, network: ctx.network, from, settings: { floorRaw, perPeriodCapRaw: usdcRaw(monthlyCap) }, priority: ctx.priority });
}

export async function disableAuto(ctx: Ctx, from: Keypair) {
  const conn = getConnection(ctx.network, ctx.rpcUrlOverride);
  return disableAutoEarn({ conn, network: ctx.network, from, priority: ctx.priority });
}

// One sweep for one wallet; the result is stored so the Earn screen can show the last run.
export async function sweepOne(ctx: Ctx, owner: PublicKey): Promise<SweepResult & { at: number; error?: string }> {
  const conn = getConnection(ctx.network, ctx.rpcUrlOverride);
  let status: SweepResult & { at: number; error?: string };
  try {
    status = { ...(await runAutoEarnSweep({ conn, network: ctx.network, owner, priority: ctx.priority })), at: Date.now() };
  } catch (e) {
    status = { owner: owner.toBase58(), pulledRaw: "0", suppliedRaw: "0", signatures: [], at: Date.now(), error: e instanceof Error ? e.message : String(e) };
  }
  if (status.skipped !== "auto-earn is off") await writeStatus(ctx.network, owner.toBase58(), status);
  return status;
}

// Alarm handler: sweeps every account in the vault that has auto-earn on; needs no unlock.
export async function sweepAllAccounts(vault: PersistedVault | null, priority?: PriorityLevel): Promise<void> {
  if (!vault?.accounts?.length) return;
  const ctx: Ctx = { network: vault.network, rpcUrlOverride: vault.rpcUrlOverride ?? null, priority };
  for (const acc of vault.accounts) {
    const owner = new PublicKey(acc.keystore.address);
    const rec = await readEarnRecord(ctx.network, owner);
    if (rec?.autodeposit?.enabled) await sweepOne(ctx, owner);
  }
}
