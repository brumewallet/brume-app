// Brume auto-earn: the automation key moves wallet USDC above a floor into Earn, capped per period on-chain.
import { getKaminoUsdcEarnTargetForCluster } from "@loyal-labs/actions";
import { PROGRAM_ID, codecs, generated } from "@loyal-labs/loyal-smart-accounts";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type AddressLookupTableAccount,
  type Connection,
  type Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import type { NetworkId } from "@/shared/constants";
import type { PriorityLevel } from "@/shared/priority-fee";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@/shared/spl-token-inline";
import { ensureBrumeSettings, resolveBrumeSettings } from "./brume-vault";
import {
  EARN_VAULT_INDEX,
  USDC_DECIMALS,
  automationKeypair,
  cluster,
  earnClient,
  earnVaultPda,
  ensureEarnRecord,
  readEarnRecord,
  usdcMint,
  writeEarnRecord,
  type EarnRecord,
} from "./earn";
import { sendPreparedInOrder, sendVersioned } from "./tx-send";

export const DEFAULT_AUTO_EARN_PERIOD_SECONDS = 30n * 24n * 60n * 60n;
// Smallest amount a sweep moves, so fees never outweigh the deposit.
export const MIN_SWEEP_RAW = 1_000_000n;
// SOL float kept on the automation key for sweep fees.
const AUTOMATION_TARGET_LAMPORTS = BigInt(LAMPORTS_PER_SOL / 100);
const AUTOMATION_MIN_LAMPORTS = BigInt(LAMPORTS_PER_SOL / 400);
// Earn policy constraint indexes: 0 = Kamino withdraw, 1 = Kamino deposit.
const EARN_DEPOSIT_CONSTRAINT = 1;
// Recurring delegation layout (verified on the mainnet fork): period start, period length, expiry, per period, pulled.
const DELEGATION_PERIOD_START = 171;
const DELEGATION_PERIOD_LENGTH = 179;
const DELEGATION_EXPIRY = 187;
const DELEGATION_AMOUNT_PER_PERIOD = 195;
const DELEGATION_AMOUNT_PULLED = 203;
const KAMINO_SETUP_DISCRIMINATORS = [
  [117, 169, 176, 69, 197, 23, 15, 162],
  [251, 10, 231, 76, 27, 11, 159, 96],
  [136, 63, 15, 186, 211, 152, 168, 164],
];

export type AutoEarnSettings = {
  floorRaw: bigint;
  perPeriodCapRaw: bigint;
  periodSeconds?: bigint;
};

export type SweepResult = {
  owner: string;
  pulledRaw: string;
  suppliedRaw: string;
  signatures: string[];
  skipped?: string;
};

async function tokenBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getAccountInfo(ata, "confirmed");
  if (!info) return 0n;
  return BigInt((await conn.getTokenAccountBalance(ata, "confirmed")).value.amount);
}

function readU64(d: Uint8Array, o: number): bigint {
  return new DataView(d.buffer, d.byteOffset + o, 8).getBigUint64(0, true);
}

function startsWith(data: Uint8Array, d: readonly number[]): boolean {
  return d.every((b, i) => data[i] === b);
}

// Creates the Earn yield-routing policy for the automation key when the wallet has none yet.
async function ensureEarnPolicy(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  settingsPda: PublicKey;
  rec: EarnRecord;
  priority?: PriorityLevel;
}): Promise<void> {
  const { conn, network, from, rec } = params;
  if (rec.policy) return;
  const res = await earnClient(conn).prepareEarnUsdcYieldRoutingPolicy({
    settingsPda: params.settingsPda,
    walletAddress: from.publicKey,
    signer: automationKeypair(rec).publicKey,
    feePayer: from.publicKey,
    cluster: cluster(network),
  });
  await sendPreparedInOrder({
    conn,
    network,
    signers: [from],
    operations: [res.prepared, res.finalizePrepared],
    priority: params.priority,
  });
  rec.policy = {
    account: res.policy.account.toBase58(),
    seed: res.policy.seed.toString(),
    setupAccount: res.setupPolicy.account.toBase58(),
    setupSeed: res.setupPolicy.seed.toString(),
  };
  await writeEarnRecord(network, from.publicKey, rec);
}

// Keeps a small SOL float on the automation key so sweeps can pay their own fees.
async function topUpAutomationSol(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  automation: PublicKey;
  priority?: PriorityLevel;
}): Promise<void> {
  const have = BigInt(await params.conn.getBalance(params.automation, "confirmed"));
  if (have >= AUTOMATION_MIN_LAMPORTS) return;
  await sendVersioned({
    conn: params.conn,
    network: params.network,
    signers: [params.from],
    ixs: [
      SystemProgram.transfer({
        fromPubkey: params.from.publicKey,
        toPubkey: params.automation,
        lamports: AUTOMATION_TARGET_LAMPORTS - have,
      }),
    ],
    priority: params.priority,
    label: "fund automation key",
  });
}

// Wallet-signed: Earn policy (if missing), subscription authority, autodeposit policy, recurring delegation, SOL float.
export async function enableAutoEarn(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  settings: AutoEarnSettings;
  priority?: PriorityLevel;
}): Promise<{ signatures: string[] }> {
  const { conn, network, from, settings } = params;
  if (settings.perPeriodCapRaw <= 0n) throw new Error("Monthly limit must be positive");
  if (settings.floorRaw < 0n) throw new Error("Wallet floor cannot be negative");
  const owner = from.publicKey;
  const settingsPda = await ensureBrumeSettings({ conn, network, from, priority: params.priority });
  const rec = await ensureEarnRecord(network, owner);
  const automation = automationKeypair(rec);
  await ensureEarnPolicy({ conn, network, from, settingsPda, rec, priority: params.priority });

  // Pin nonce and policy seed so every setup stage derives the same accounts, also when resuming.
  rec.autodepositSetup ??= { nonce: String(Math.floor(Date.now() / 1000)) };
  await writeEarnRecord(network, owner, rec);
  const periodSeconds = settings.periodSeconds ?? DEFAULT_AUTO_EARN_PERIOD_SECONDS;
  const client = earnClient(conn);
  const signatures: string[] = [];
  let policy: PublicKey | null = null;
  let delegation: PublicKey | null = null;
  for (let stage = 0; stage < 3; stage++) {
    const res = await client.prepareEarnUsdcAutodepositSetup({
      settingsPda,
      walletAddress: owner,
      feePayer: owner,
      signer: owner,
      policySigner: automation.publicKey,
      amountRaw: settings.perPeriodCapRaw,
      minimumDelegatorBalanceRaw: settings.floorRaw,
      periodLengthSeconds: periodSeconds,
      nonce: BigInt(rec.autodepositSetup.nonce),
      ...(rec.autodepositSetup.policySeed ? { policySeed: BigInt(rec.autodepositSetup.policySeed) } : {}),
      cluster: cluster(network),
    });
    if (res.policy.seed != null && !rec.autodepositSetup.policySeed) {
      rec.autodepositSetup.policySeed = res.policy.seed.toString();
      await writeEarnRecord(network, owner, rec);
    }
    signatures.push(
      ...(await sendPreparedInOrder({ conn, network, signers: [from], operations: [res.prepared], priority: params.priority })),
    );
    policy = res.policy.account;
    delegation = res.subscription.recurringDelegation;
    if (res.stage === "create_recurring_delegation") break;
  }
  if (!policy || !delegation) throw new Error("Auto-earn setup did not finish");

  await topUpAutomationSol({ conn, network, from, automation: automation.publicKey, priority: params.priority });
  rec.autodeposit = {
    policy: policy.toBase58(),
    recurringDelegation: delegation.toBase58(),
    floorRaw: settings.floorRaw.toString(),
    perPeriodCapRaw: settings.perPeriodCapRaw.toString(),
    periodSeconds: periodSeconds.toString(),
    enabled: true,
  };
  delete rec.autodepositSetup;
  await writeEarnRecord(network, owner, rec);
  return { signatures };
}

// Wallet-signed: revokes the recurring delegation and closes the autodeposit policy.
export async function disableAutoEarn(params: {
  conn: Connection;
  network: NetworkId;
  from: Keypair;
  priority?: PriorityLevel;
}): Promise<{ signatures: string[] }> {
  const { conn, network, from } = params;
  const owner = from.publicKey;
  const rec = await readEarnRecord(network, owner);
  if (!rec?.autodeposit) return { signatures: [] };
  const settingsPda = await resolveBrumeSettings({ conn, network, owner, discover: true });
  if (!settingsPda) throw new Error("No Brume vault");
  const res = await earnClient(conn).prepareEarnUsdcAutodepositClose({
    settingsPda,
    walletAddress: owner,
    feePayer: owner,
    signer: owner,
    policySigner: automationKeypair(rec).publicKey,
    policy: new PublicKey(rec.autodeposit.policy),
    recurringDelegation: new PublicKey(rec.autodeposit.recurringDelegation),
    cluster: cluster(network),
  });
  const signatures = await sendPreparedInOrder({ conn, network, signers: [from], operations: [res.prepared], priority: params.priority });
  delete rec.autodeposit;
  await writeEarnRecord(network, owner, rec);
  return { signatures };
}

// Remaining pull allowance; the program resets `pulled` lazily, so an elapsed period means the full amount is available.
export async function remainingAllowance(conn: Connection, delegation: PublicKey): Promise<bigint> {
  const info = await conn.getAccountInfo(delegation, "confirmed");
  if (!info) return 0n;
  const d = info.data;
  const now = BigInt((await conn.getBlockTime(await conn.getSlot("confirmed"))) ?? Math.floor(Date.now() / 1000));
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const start = view.getBigInt64(DELEGATION_PERIOD_START, true);
  const length = view.getBigInt64(DELEGATION_PERIOD_LENGTH, true);
  const expiry = view.getBigInt64(DELEGATION_EXPIRY, true);
  if (expiry > 0n && now >= expiry) return 0n;
  const perPeriod = readU64(d, DELEGATION_AMOUNT_PER_PERIOD);
  if (length > 0n && now >= start + length) return perPeriod;
  const pulled = readU64(d, DELEGATION_AMOUNT_PULLED);
  return perPeriod > pulled ? perPeriod - pulled : 0n;
}

type KaminoBundle = {
  before: TransactionInstruction[];
  deposit: TransactionInstruction;
  after: TransactionInstruction[];
  lookupTables: AddressLookupTableAccount[];
  needsSetup: boolean;
};

// Kamino's mainnet deposit bundle for the Earn vault, split around the deposit instruction.
async function kaminoDepositBundle(conn: Connection, network: NetworkId, vault: PublicKey, amountRaw: bigint): Promise<KaminoBundle> {
  if (network !== "mainnet-beta") throw new Error("Auto-earn top-up runs on Mainnet only");
  const target = getKaminoUsdcEarnTargetForCluster(cluster(network));
  const scale = 10n ** BigInt(USDC_DECIMALS);
  const amount = `${amountRaw / scale}.${(amountRaw % scale).toString().padStart(USDC_DECIMALS, "0")}`;
  const res = await fetch("https://api.kamino.finance/ktx/klend/deposit-instructions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: vault.toBase58(), market: target.market.toBase58(), reserve: target.reserve.toBase58(), amount }),
  });
  if (!res.ok) throw new Error(`Kamino deposit request failed (${res.status})`);
  const body = (await res.json()) as {
    instructions: { programAddress: string; accounts?: { address: string; role: string }[]; data: string }[];
    lutsByAddress?: Record<string, string[]>;
  };
  const lend = target.lendProgramId.toBase58();
  const ixs = body.instructions
    .filter((ix) => ix.programAddress === lend)
    .map(
      (ix) =>
        new TransactionInstruction({
          programId: new PublicKey(ix.programAddress),
          keys: (ix.accounts ?? []).map((a) => ({
            pubkey: new PublicKey(a.address),
            isSigner: a.role.toUpperCase().includes("SIGNER"),
            isWritable: a.role.toUpperCase().includes("WRITABLE"),
          })),
          data: Buffer.from(ix.data, "base64"),
        }),
    );
  const at = ixs.findIndex((ix) => startsWith(ix.data, target.depositDiscriminator));
  if (at < 0) throw new Error("Kamino did not return a deposit instruction");
  const lookupTables = (
    await Promise.all(Object.keys(body.lutsByAddress ?? {}).map((k) => conn.getAddressLookupTable(new PublicKey(k))))
  )
    .map((r) => r.value)
    .filter((v): v is AddressLookupTableAccount => v != null);
  return {
    before: ixs.slice(0, at),
    deposit: ixs[at],
    after: ixs.slice(at + 1),
    lookupTables,
    needsSetup: ixs.some((ix) => KAMINO_SETUP_DISCRIMINATORS.some((d) => startsWith(ix.data, d))),
  };
}

// Automation-signed: idle Earn vault USDC to Kamino through the Earn policy's deposit constraint.
async function supplyIdleUsdc(params: {
  conn: Connection;
  network: NetworkId;
  automation: Keypair;
  rec: EarnRecord;
  vault: PublicKey;
  amountRaw: bigint;
  priority?: PriorityLevel;
}): Promise<string> {
  const { conn, network, automation, vault } = params;
  if (!params.rec.policy) throw new Error("Earn policy missing");
  const bundle = await kaminoDepositBundle(conn, network, vault, params.amountRaw);
  if (bundle.needsSetup) throw new Error("First Earn deposit must be made from the wallet");
  const deposit = new TransactionInstruction({
    programId: bundle.deposit.programId,
    keys: bundle.deposit.keys.map((k) => (k.pubkey.equals(vault) ? { ...k, isWritable: true } : k)),
    data: bundle.deposit.data,
  });
  const compiled = codecs.instructionsToSynchronousTransactionDetailsV2({
    vaultPda: vault,
    members: [automation.publicKey],
    transaction_instructions: [deposit],
  });
  const execute = generated.createExecuteTransactionSyncV2Instruction(
    { consensusAccount: new PublicKey(params.rec.policy.account), program: PROGRAM_ID, anchorRemainingAccounts: compiled.accounts },
    {
      args: {
        accountIndex: EARN_VAULT_INDEX,
        numSigners: 1,
        payload: {
          __kind: "Policy",
          fields: [
            {
              __kind: "ProgramInteraction",
              fields: [
                {
                  instructionConstraintIndices: Uint8Array.from([EARN_DEPOSIT_CONSTRAINT]),
                  transactionPayload: {
                    __kind: "SyncTransaction",
                    fields: [{ accountIndex: EARN_VAULT_INDEX, instructions: compiled.instructions }],
                  },
                },
              ],
            },
          ],
        },
      },
    },
    PROGRAM_ID,
  );
  return sendVersioned({
    conn,
    network,
    signers: [automation],
    ixs: [...bundle.before, execute, ...bundle.after],
    lookupTables: bundle.lookupTables,
    priority: params.priority,
    label: "auto-earn supply",
  });
}

// One sweep for one wallet, signed only by its automation key; the main wallet key is never needed.
export async function runAutoEarnSweep(params: {
  conn: Connection;
  network: NetworkId;
  owner: PublicKey;
  priority?: PriorityLevel;
}): Promise<SweepResult> {
  const { conn, network, owner } = params;
  const result: SweepResult = { owner: owner.toBase58(), pulledRaw: "0", suppliedRaw: "0", signatures: [] };
  const rec = await readEarnRecord(network, owner);
  const auto = rec?.autodeposit;
  if (!rec || !auto?.enabled) return { ...result, skipped: "auto-earn is off" };
  const settingsPda = await resolveBrumeSettings({ conn, network, owner, discover: false });
  if (!settingsPda) return { ...result, skipped: "no Brume vault" };
  const automation = automationKeypair(rec);
  if (BigInt(await conn.getBalance(automation.publicKey, "confirmed")) < AUTOMATION_MIN_LAMPORTS / 2n) {
    return { ...result, skipped: "automation key needs SOL for fees" };
  }

  const mint = usdcMint(network);
  const vault = earnVaultPda(settingsPda);
  const walletUsdc = await tokenBalance(conn, getAssociatedTokenAddressSync(mint, owner, TOKEN_PROGRAM_ID));
  const surplus = walletUsdc - BigInt(auto.floorRaw);
  if (surplus >= MIN_SWEEP_RAW) {
    const delegation = new PublicKey(auto.recurringDelegation);
    const allowance = await remainingAllowance(conn, delegation);
    const pull = surplus < allowance ? surplus : allowance;
    if (pull >= MIN_SWEEP_RAW) {
      const prepared = await earnClient(conn).prepareEarnUsdcAutodepositPull({
        policy: new PublicKey(auto.policy),
        walletAddress: owner,
        feePayer: automation.publicKey,
        policySigner: automation.publicKey,
        recurringDelegation: delegation,
        amountRaw: pull,
        cluster: cluster(network),
      });
      result.signatures.push(
        ...(await sendPreparedInOrder({ conn, network, signers: [automation], operations: [prepared.prepared], priority: params.priority })),
      );
      result.pulledRaw = pull.toString();
      rec.principalRaw = (BigInt(rec.principalRaw ?? "0") + pull).toString();
      await writeEarnRecord(network, owner, rec);
    }
  }

  const idle = await tokenBalance(conn, getAssociatedTokenAddressSync(mint, vault, TOKEN_PROGRAM_ID));
  if (idle >= MIN_SWEEP_RAW && network === "mainnet-beta") {
    result.signatures.push(
      await supplyIdleUsdc({ conn, network, automation, rec, vault, amountRaw: idle, priority: params.priority }),
    );
    result.suppliedRaw = idle.toString();
  }
  if (result.signatures.length === 0) result.skipped = "nothing to move";
  return result;
}
