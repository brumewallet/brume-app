// Mainnet-fork stateful fuzz of Brume vault shield, unshield and send; env: FUZZ_RUNS, FUZZ_MAX_COMMANDS, FUZZ_TRACE, FC_SEED, FC_PATH.
import fc from "fast-check";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createMint,
  freezeAccount,
  getAssociatedTokenAddressSync,
  getMintLen,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  thawAccount,
  transferChecked,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { PROGRAM_ID, accounts, codecs, generated, pda } from "@loyal-labs/loyal-smart-accounts";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  fetchShieldVaultBalances,
  brumeShield,
  shieldVaultPdaFor,
  brumeVaultTransferOut,
  parseTokenAmount,
} from "@/background/brume-vault";
import { encodeBase58 } from "@/shared/base58";
import {
  MAX_PRICE_MICRO_LAMPORTS,
  PRIORITY_LEVELS,
  PRIORITY_POLICY,
  type PriorityLevel,
} from "@/shared/priority-fee";

const NETWORK = "mainnet-beta" as const;
const STORAGE_KEY = "brume_vault_v1";
const SOL = "So11111111111111111111111111111111111111112";
const U64 = 2n ** 64n;
const FUZZ_RUNS = Number(process.env.FUZZ_RUNS ?? 12);
const MAX_COMMANDS = Number(process.env.FUZZ_MAX_COMMANDS ?? 40);
const SETTINGS_FIRST_SIGNER_OFFSET = 124;

// chrome.storage stub (the vault module stores the Settings PDA there).

const storage: Record<string, unknown> = {};
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (k: string) => ({ [k]: structuredClone(storage[k]) }),
      set: async (o: Record<string, unknown>) => Object.assign(storage, structuredClone(o)),
    },
  },
};
const clearStorage = () => {
  for (const k of Object.keys(storage)) delete storage[k];
};
const storedSettings = (owner: PublicKey): string | undefined =>
  (storage[STORAGE_KEY] as Record<string, string> | undefined)?.[`${NETWORK}:${owner.toBase58()}`];

// Fork environment, built once.

type MintKey = "SOL" | "USDC" | "SPL0" | "SPL9F" | "T22" | "T22FEE";
type MintSpec = {
  key: MintKey;
  address: string;
  decimals: number;
  programId: PublicKey;
  fund: bigint; // raw amount given to each run's owner
  feeBps?: number;
  maxFee?: bigint;
};

type Env = {
  conn: Connection;
  payer: Keypair; // mint + freeze authority for local mints, funds runs
  whale: Keypair;
  stranger: Keypair;
  mints: Record<MintKey, MintSpec>;
  rentMin: bigint;
};

let env: Env;

async function airdrop(conn: Connection, to: PublicKey, sol: number) {
  const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
}

async function createTransferFeeMint(conn: Connection, payer: Keypair, decimals: number, bps: number, maxFee: bigint) {
  const mint = Keypair.generate();
  const len = getMintLen([ExtensionType.TransferFeeConfig]);
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: len,
      lamports: await conn.getMinimumBalanceForRentExemption(len),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      mint.publicKey, payer.publicKey, payer.publicKey, bps, maxFee, TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(mint.publicKey, decimals, payer.publicKey, null, TOKEN_2022_PROGRAM_ID),
  );
  await sendAndConfirmTransaction(conn, tx, [payer, mint], { commitment: "confirmed" });
  return mint.publicKey;
}

function transferFee(spec: MintSpec, amount: bigint): bigint {
  if (!spec.feeBps) return 0n;
  const raw = (amount * BigInt(spec.feeBps) + 9_999n) / 10_000n;
  return raw < spec.maxFee! ? raw : spec.maxFee!;
}

// Model and real system.

type Model = {
  settings: PublicKey | null;
  vault: Record<MintKey, bigint>;
  wallet: Record<MintKey, bigint>; // token mints only; SOL is read live (fees)
  recipients: Map<string, bigint>; // `${recipient}:${mintKey}`
  vaultAtas: Set<MintKey>;
};

type Real = {
  conn: Connection;
  owner: Keypair;
  recipients: Keypair[];
};

const TOKEN_KEYS: MintKey[] = ["USDC", "SPL0", "SPL9F", "T22", "T22FEE"];
const ALL_KEYS: MintKey[] = ["SOL", ...TOKEN_KEYS];

async function tokenBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const info = await conn.getAccountInfo(ata, "confirmed");
  if (!info) return 0n;
  return BigInt((await conn.getTokenAccountBalance(ata, "confirmed")).value.amount);
}

async function ownedSettingsCount(conn: Connection, owner: PublicKey): Promise<number> {
  const hits = await conn.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    dataSlice: { offset: 0, length: 0 },
    filters: [
      { memcmp: { offset: 0, bytes: encodeBase58(Uint8Array.from(accounts.settingsDiscriminator)) } },
      { memcmp: { offset: SETTINGS_FIRST_SIGNER_OFFSET, bytes: owner.toBase58() } },
    ],
  });
  return hits.length;
}

// Independent read of every balance and authority invariant, compared with the model.
async function checkInvariants(m: Model, r: Real, label: string) {
  const { conn, owner } = r;
  const ctx = (what: string) => `${label}: ${what}`;
  const stored = storedSettings(owner.publicKey);

  expect(await ownedSettingsCount(conn, owner.publicKey), ctx("owned Settings accounts")).toBe(m.settings ? 1 : 0);

  if (!m.settings) {
    expect(stored, ctx("stored settings before first shield")).toBeUndefined();
  } else {
    if (stored) expect(stored, ctx("stored settings")).toBe(m.settings.toBase58());
    const s = await accounts.Settings.fromAccountAddress(conn, m.settings, "confirmed");
    expect(s.threshold, ctx("threshold")).toBe(1);
    expect(s.timeLock, ctx("time lock")).toBe(0);
    expect(s.settingsAuthority.equals(PublicKey.default), ctx("settings authority")).toBe(true);
    expect(s.signers.map((x) => x.key.toBase58()), ctx("signers")).toEqual([owner.publicKey.toBase58()]);
    expect(s.signers[0].permissions.mask, ctx("signer permissions")).toBe(codecs.Permissions.all().mask);
  }

  const vault = m.settings ? shieldVaultPdaFor(m.settings) : null;
  expect(vault ? BigInt(await conn.getBalance(vault, "confirmed")) : 0n, ctx("vault SOL")).toBe(m.vault.SOL);

  for (const key of TOKEN_KEYS) {
    const spec = env.mints[key];
    const mint = new PublicKey(spec.address);
    const walletAta = getAssociatedTokenAddressSync(mint, owner.publicKey, false, spec.programId);
    expect(await tokenBalance(conn, walletAta), ctx(`wallet ${key}`)).toBe(m.wallet[key]);
    const vaultBal = vault
      ? await tokenBalance(conn, getAssociatedTokenAddressSync(mint, vault, true, spec.programId))
      : 0n;
    expect(vaultBal, ctx(`vault ${key}`)).toBe(m.vault[key]);
  }

  for (const [k, want] of m.recipients) {
    const [addr, key] = k.split(":") as [string, MintKey];
    const spec = env.mints[key];
    const who = new PublicKey(addr);
    const got =
      key === "SOL"
        ? BigInt(await conn.getBalance(who, "confirmed"))
        : await tokenBalance(conn, getAssociatedTokenAddressSync(new PublicKey(spec.address), who, false, spec.programId));
    expect(got, ctx(`recipient ${addr.slice(0, 6)} ${key}`)).toBe(want);
  }

  // The wallet's own read path must agree with the chain whenever it knows the vault.
  if (stored) {
    const view = await fetchShieldVaultBalances({ conn, network: NETWORK, owner: owner.publicKey });
    for (const key of ["SOL", ...TOKEN_KEYS] as MintKey[]) {
      expect(BigInt(view[env.mints[key].address] ?? "0"), ctx(`module view ${key}`)).toBe(m.vault[key]);
    }
  }
}

// Amounts are resolved against the model at run time so boundaries get hit.

type Sel =
  | { k: "permille"; p: number }
  | { k: "all" }
  | { k: "allPlus1" }
  | { k: "zero" }
  | { k: "abs"; raw: bigint }
  | { k: "rentEdge"; d: number }
  | { k: "u64Overflow" };

type Fmt = { thousands: boolean; trailingZeros: number; pad: string };

const selArb: fc.Arbitrary<Sel> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 1, max: 1000 }).map((p) => ({ k: "permille" as const, p })) },
  { weight: 2, arbitrary: fc.constant({ k: "all" as const }) },
  { weight: 2, arbitrary: fc.constant({ k: "allPlus1" as const }) },
  { weight: 1, arbitrary: fc.constant({ k: "zero" as const }) },
  { weight: 2, arbitrary: fc.bigInt({ min: 1n, max: 10n ** 13n }).map((raw) => ({ k: "abs" as const, raw })) },
  { weight: 2, arbitrary: fc.integer({ min: -2, max: 2 }).map((d) => ({ k: "rentEdge" as const, d })) },
  { weight: 1, arbitrary: fc.constant({ k: "u64Overflow" as const }) },
);
const fmtArb: fc.Arbitrary<Fmt> = fc.record({
  thousands: fc.boolean(),
  trailingZeros: fc.integer({ min: 0, max: 2 }),
  pad: fc.constantFrom("", " ", "\t"),
});
const mintArb = fc.constantFrom<MintKey>("SOL", "USDC", "SPL0", "SPL9F", "T22", "T22FEE");

function resolveSel(sel: Sel, available: bigint, rentEdgeBase: bigint): bigint {
  switch (sel.k) {
    case "permille": return (available * BigInt(sel.p)) / 1000n;
    case "all": return available;
    case "allPlus1": return available + 1n;
    case "zero": return 0n;
    case "abs": return sel.raw;
    case "rentEdge": { const v = rentEdgeBase + BigInt(sel.d); return v < 0n ? 0n : v; }
    case "u64Overflow": return U64 + 5n;
  }
}

function formatAmount(raw: bigint, decimals: number, f: Fmt): string {
  const scale = 10n ** BigInt(decimals);
  let whole = (raw / scale).toString();
  if (f.thousands) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = decimals > 0 ? (raw % scale).toString().padStart(decimals, "0") + "0".repeat(f.trailingZeros) : "";
  return f.pad + whole + (frac ? "." + frac : "") + f.pad;
}

type Expect = "ok" | "reject" | "either";

// Outcome counters, printed after the run to show which paths the fuzzer exercised.
const stats = new Map<string, number>();
function count(kind: string, outcome: string) {
  const k = `${kind.padEnd(28)} ${outcome}`;
  stats.set(k, (stats.get(k) ?? 0) + 1);
}

async function attempt(f: () => Promise<unknown>): Promise<{ ok: boolean; err?: string }> {
  try {
    await f();
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : String(e) };
  }
}

// Reads a landed wallet transaction back and checks its compute budget.
async function assertComputeBudget(conn: Connection, signature: string, level: PriorityLevel, label: string) {
  const tx = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  expect(tx, `${label}: landed transaction`).not.toBeNull();
  const msg = tx!.transaction.message;
  const keys = msg.staticAccountKeys;
  const ixs = msg.compiledInstructions;
  const isBudget = (i: number) => keys[ixs[i].programIdIndex].equals(ComputeBudgetProgram.programId);
  expect(ixs.length >= 3 && isBudget(0) && isBudget(1), `${label}: compute budget instructions first`).toBe(true);
  const limitIx = Buffer.from(ixs[0].data);
  const priceIx = Buffer.from(ixs[1].data);
  expect(limitIx[0], `${label}: SetComputeUnitLimit`).toBe(2);
  expect(priceIx[0], `${label}: SetComputeUnitPrice`).toBe(3);
  const limit = limitIx.readUInt32LE(1);
  const price = Number(priceIx.readBigUInt64LE(1));
  const used = tx!.meta?.computeUnitsConsumed ?? 0;
  expect(limit, `${label}: limit covers usage (${used} CU)`).toBeGreaterThanOrEqual(used);
  expect(price, `${label}: price >= ${level} floor`).toBeGreaterThanOrEqual(PRIORITY_POLICY[level].floor);
  expect(price, `${label}: price <= cap`).toBeLessThanOrEqual(MAX_PRICE_MICRO_LAMPORTS);
  count(`compute-budget ${level}`, "verified");
  maxCuSeen = Math.max(maxCuSeen, used);
}
let maxCuSeen = 0;

function assertOutcome(label: string, exp: Expect, res: { ok: boolean; err?: string }) {
  if (exp === "ok") expect(res.err, `${label} should succeed`).toBeUndefined();
  if (exp === "reject") expect(res.ok, `${label} should be rejected`).toBe(false);
}

// Commands.

class ShieldCmd implements fc.AsyncCommand<Model, Real> {
  constructor(
    readonly key: MintKey,
    readonly sel: Sel,
    readonly fmt: Fmt,
    readonly race = false,
    readonly level: PriorityLevel = "normal",
  ) {}
  check = () => true;
  toString = () => `${this.race ? "RaceShield" : "Shield"}(${this.key}, ${JSON.stringify(this.sel, (_, v) => (typeof v === "bigint" ? `${v}n` : v))})`;
  async run(m: Model, r: Real) {
    const spec = env.mints[this.key];
    const isSol = this.key === "SOL";
    const walletSol = BigInt(await r.conn.getBalance(r.owner.publicKey, "confirmed"));
    const available = isSol ? walletSol : m.wallet[this.key];
    const amt = resolveSel(this.sel, available, isSol ? (env.rentMin > m.vault.SOL ? env.rentMin - m.vault.SOL : 0n) : 1n);
    const text = formatAmount(amt, spec.decimals, this.fmt);

    let exp: Expect;
    if (amt === 0n || amt >= U64) exp = "reject";
    else if (isSol) {
      const buffer = LAMPORTS_PER_SOL / 20; // fees + Settings/ATA rent on first shield
      if (m.vault.SOL + amt < env.rentMin || amt > walletSol) exp = "reject";
      else if (amt + BigInt(buffer) > walletSol) exp = "either";
      else exp = "ok";
    } else exp = amt <= m.wallet[this.key] ? "ok" : "reject";

    const conn = this.race && !m.settings ? racingConnection(r.conn) : r.conn;
    let result: Awaited<ReturnType<typeof brumeShield>> | undefined;
    const res = await attempt(async () => {
      result = await brumeShield({ conn, network: NETWORK, from: r.owner, mintAddress: spec.address, amountStr: text, priority: this.level });
    });
    assertOutcome(`${this} amount=${amt} text=${JSON.stringify(text)}`, exp, res);
    count(`${this.race ? "race-shield" : "shield"} ${this.key}`, res.ok ? "ok" : "rejected");

    if (res.ok && result) {
      await assertComputeBudget(r.conn, result.signature, this.level, `${this}`);
      if (m.settings) expect(result.settingsPda, "shield must reuse the existing Settings").toBe(m.settings.toBase58());
      m.settings = new PublicKey(result.settingsPda);
      if (isSol) m.vault.SOL += amt;
      else {
        m.wallet[this.key] -= amt;
        m.vault[this.key] += amt - transferFee(spec, amt);
        m.vaultAtas.add(this.key);
      }
    }
    await checkInvariants(m, r, `${this} [${res.ok ? "ok" : res.err}]`);
  }
}

class TransferOutCmd implements fc.AsyncCommand<Model, Real> {
  private key: MintKey;
  constructor(
    readonly requested: MintKey,
    readonly sel: Sel,
    readonly fmt: Fmt,
    readonly to: number | "owner" | "self",
    readonly preferHeld = false,
    readonly level: PriorityLevel = "normal",
  ) {
    this.key = requested;
  }
  check = () => true;
  toString = () => `${this.to === "owner" ? "Unshield" : `SendOut(->${this.to})`}(${this.requested}${this.preferHeld ? "|held" : ""}, ${JSON.stringify(this.sel, (_, v) => (typeof v === "bigint" ? `${v}n` : v))})`;
  async run(m: Model, r: Real) {
    // Most of the time act on a mint the vault really holds, so success paths get exercised.
    this.key = this.requested;
    if (this.preferHeld && m.vault[this.key] === 0n) {
      const held = (["SOL", ...TOKEN_KEYS] as MintKey[]).filter((k) => m.vault[k] > 0n);
      if (held.length) this.key = held[ALL_KEYS.indexOf(this.requested) % held.length];
    }
    const spec = env.mints[this.key];
    const isSol = this.key === "SOL";
    const vault = m.settings ? shieldVaultPdaFor(m.settings) : null;
    const dest =
      this.to === "owner" ? r.owner.publicKey : this.to === "self" ? vault : r.recipients[this.to].publicKey;
    const amt = resolveSel(this.sel, m.vault[this.key], isSol ? m.vault.SOL - env.rentMin : 1n);
    const text = formatAmount(amt, spec.decimals, this.fmt);
    const recKey = dest && typeof this.to === "number" ? `${dest.toBase58()}:${this.key}` : null;

    let exp: Expect;
    if (!m.settings || !dest || amt === 0n || amt >= U64 || amt > m.vault[this.key]) exp = "reject";
    else if (isSol) {
      const left = m.vault.SOL - amt;
      const destBal = recKey ? (m.recipients.get(recKey) ?? 0n) : 1n;
      if (left > 0n && left < env.rentMin) exp = "reject";
      else if (destBal === 0n && amt < env.rentMin) exp = "reject";
      else exp = this.to === "self" ? "either" : "ok";
    } else exp = this.to === "self" ? "either" : "ok";

    let signature: string | undefined;
    const res = await attempt(async () => {
      ({ signature } = await brumeVaultTransferOut({
        conn: r.conn,
        network: NETWORK,
        from: r.owner,
        mintAddress: spec.address,
        amountStr: text,
        priority: this.level,
        ...(this.to === "owner" ? {} : { toAddress: (dest ?? r.owner.publicKey).toBase58() }),
      }));
    });
    if (res.ok && signature) await assertComputeBudget(r.conn, signature, this.level, `${this}`);
    assertOutcome(`${this} amount=${amt} text=${JSON.stringify(text)}`, exp, res);
    count(`${this.to === "owner" ? "unshield" : this.to === "self" ? "send-to-self" : "send-out"} ${this.key}`, res.ok ? "ok" : "rejected");

    if (res.ok && this.to !== "self") {
      const received = amt - (isSol ? 0n : transferFee(spec, amt));
      m.vault[this.key] -= amt;
      if (this.to === "owner") {
        if (!isSol) m.wallet[this.key] += received;
      } else {
        m.recipients.set(recKey!, (m.recipients.get(recKey!) ?? 0n) + received);
      }
    }
    await checkInvariants(m, r, `${this} [${res.ok ? "ok" : res.err}]`);
  }
}

class ForgetStorageCmd implements fc.AsyncCommand<Model, Real> {
  check = () => true;
  toString = () => "ForgetStorage";
  async run(m: Model, r: Real) {
    clearStorage();
    count("forget-storage", "done");
    await checkInvariants(m, r, `${this}`);
  }
}

// Someone who is not the vault's signer tries to drain it through executeTransactionSync.
class StrangerDrainCmd implements fc.AsyncCommand<Model, Real> {
  constructor(readonly key: MintKey, readonly variant: "stranger-member" | "owner-unsigned") {}
  check = (m: Readonly<Model>) => m.settings != null && m.vault[this.key] > 0n;
  toString = () => `StrangerDrain(${this.key}, ${this.variant})`;
  async run(m: Model, r: Real) {
    const spec = env.mints[this.key];
    const thief = env.stranger;
    const vault = shieldVaultPdaFor(m.settings!);
    const amount = m.vault[this.key];
    const outer: TransactionInstruction[] = [];
    let inner: TransactionInstruction;
    if (this.key === "SOL") {
      inner = SystemProgram.transfer({ fromPubkey: vault, toPubkey: thief.publicKey, lamports: amount });
    } else {
      const mint = new PublicKey(spec.address);
      const src = getAssociatedTokenAddressSync(mint, vault, true, spec.programId);
      const dst = getAssociatedTokenAddressSync(mint, thief.publicKey, false, spec.programId);
      await getOrCreateAssociatedTokenAccount(r.conn, thief, mint, thief.publicKey, false, "confirmed", undefined, spec.programId);
      const { createTransferCheckedInstruction } = await import("@solana/spl-token");
      inner = createTransferCheckedInstruction(src, mint, dst, vault, amount, spec.decimals, [], spec.programId);
      inner.keys = inner.keys.map((k) => (k.pubkey.equals(vault) ? { ...k, isWritable: true } : k));
    }
    const member = this.variant === "stranger-member" ? thief.publicKey : r.owner.publicKey;
    const details = codecs.instructionsToSynchronousTransactionDetails({
      vaultPda: vault,
      members: [member],
      transaction_instructions: [inner],
    });
    const metas =
      this.variant === "owner-unsigned"
        ? details.accounts.map((a) => (a.pubkey.equals(r.owner.publicKey) ? { ...a, isSigner: false } : a))
        : details.accounts;
    outer.push(
      generated.createExecuteTransactionSyncInstruction(
        { consensusAccount: m.settings!, program: PROGRAM_ID, anchorRemainingAccounts: metas },
        { args: { accountIndex: 0, numSigners: 1, instructions: details.instructions } },
        PROGRAM_ID,
      ),
    );
    const bh = await r.conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: thief.publicKey, recentBlockhash: bh.blockhash }).add(...outer);
    tx.sign(thief);
    // skipPreflight so the program itself, not RPC simulation, has to refuse it.
    const landed = await attempt(async () => {
      const sig = await r.conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
      const st = await r.conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      if (st.value.err) throw new Error(JSON.stringify(st.value.err));
    });
    expect(landed.ok, `${this}: a non-signer must not move vault funds`).toBe(false);
    count(`stranger-drain ${this.variant}`, "refused on-chain");
    await checkInvariants(m, r, `${this}`);
  }
}

// Malformed amount text must be refused before anything is signed.
class GarbageAmountCmd implements fc.AsyncCommand<Model, Real> {
  constructor(readonly key: MintKey, readonly op: "shield" | "unshield", readonly text: string) {}
  check = () => true;
  toString = () => `Garbage(${this.op}, ${this.key}, ${JSON.stringify(this.text)})`;
  async run(m: Model, r: Real) {
    const spec = env.mints[this.key];
    let parses = true;
    try { parseTokenAmount(this.text, spec.decimals); } catch { parses = false; }
    if (parses) return; // a valid amount; covered by the other commands
    const res = await attempt(() =>
      this.op === "shield"
        ? brumeShield({ conn: r.conn, network: NETWORK, from: r.owner, mintAddress: spec.address, amountStr: this.text })
        : brumeVaultTransferOut({ conn: r.conn, network: NETWORK, from: r.owner, mintAddress: spec.address, amountStr: this.text }),
    );
    expect(res.ok, `${this} must be rejected`).toBe(false);
    count(`garbage-amount ${this.op}`, "rejected");
    await checkInvariants(m, r, `${this}`);
  }
}

// The issuer freezes the vault token account (USDC/USDT can do this on mainnet).
class UnshieldWhileFrozenCmd implements fc.AsyncCommand<Model, Real> {
  check = (m: Readonly<Model>) => m.settings != null && m.vaultAtas.has("SPL9F") && m.vault.SPL9F > 0n;
  toString = () => "UnshieldWhileFrozen(SPL9F)";
  async run(m: Model, r: Real) {
    const spec = env.mints.SPL9F;
    const mint = new PublicKey(spec.address);
    const ata = getAssociatedTokenAddressSync(mint, shieldVaultPdaFor(m.settings!), true);
    await freezeAccount(r.conn, env.payer, ata, mint, env.payer, [], { commitment: "confirmed" });
    try {
      const res = await attempt(() =>
        brumeVaultTransferOut({ conn: r.conn, network: NETWORK, from: r.owner, mintAddress: spec.address, amountStr: formatAmount(1n, spec.decimals, { thousands: false, trailingZeros: 0, pad: "" }) }),
      );
      expect(res.ok, `${this} must be rejected`).toBe(false);
      count("unshield-while-frozen", "rejected");
      await checkInvariants(m, r, `${this}`);
    } finally {
      await thawAccount(r.conn, env.payer, ata, mint, env.payer, [], { commitment: "confirmed" });
    }
  }
}

// A Connection whose first getLatestBlockhash lets a competitor create a Smart Account at the global index this wallet just derived, forcing the "index taken" retry path.
function racingConnection(conn: Connection): Connection {
  let fired = false;
  return new Proxy(conn, {
    get(target, prop, receiver) {
      if (prop === "getLatestBlockhash") {
        return async (...args: Parameters<Connection["getLatestBlockhash"]>) => {
          if (!fired) {
            fired = true;
            await competitorCreatesSmartAccount(target);
          }
          return target.getLatestBlockhash(...args);
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

async function competitorCreatesSmartAccount(conn: Connection) {
  const competitor = Keypair.generate();
  await airdrop(conn, competitor.publicKey, 1);
  const [configPda] = pda.getProgramConfigPda({});
  const config = await accounts.ProgramConfig.fromAccountAddress(conn, configPda, "confirmed");
  const [settingsPda] = pda.getSettingsPda({ accountIndex: BigInt(config.smartAccountIndex.toString()) + 1n });
  const ix = generated.createCreateSmartAccountInstruction(
    {
      programConfig: configPda,
      treasury: config.treasury,
      creator: competitor.publicKey,
      program: PROGRAM_ID,
      anchorRemainingAccounts: [{ pubkey: settingsPda, isSigner: false, isWritable: true }],
    },
    {
      args: {
        settingsAuthority: null,
        threshold: 1,
        signers: [{ key: competitor.publicKey, permissions: codecs.Permissions.all() }],
        timeLock: 0,
        rentCollector: null,
        memo: null,
      },
    },
    PROGRAM_ID,
  );
  await sendAndConfirmTransaction(conn, new Transaction().add(ix), [competitor], { commitment: "confirmed" });
}

const nastyTextArb = fc.string({
  unit: fc.constantFrom(..."0123456789.,-+eExX_ \t".split(""), "١", "０", " ", "NaN", "Infinity", "0x"),
  maxLength: 16,
});

const levelArb = fc.constantFrom<PriorityLevel>(...PRIORITY_LEVELS);
const shieldArb = fc.tuple(mintArb, selArb, fmtArb, levelArb).map(([k, s, f, l]) => new ShieldCmd(k, s, f, false, l));
const preferHeldArb = fc.integer({ min: 0, max: 3 }).map((n) => n > 0);
const unshieldArb = fc
  .tuple(mintArb, selArb, fmtArb, preferHeldArb, levelArb)
  .map(([k, s, f, h, l]) => new TransferOutCmd(k, s, f, "owner", h, l));
const sendOutArb = fc
  .tuple(mintArb, selArb, fmtArb, fc.constantFrom<0 | 1 | 2 | "self">(0, 1, 2, "self"), preferHeldArb, levelArb)
  .map(([k, s, f, to, h, l]) => new TransferOutCmd(k, s, f, to, h, l));

const commandsArb = fc.commands(
  [
    // Shields are weighted up so unshield / send paths usually have funds to work with.
    shieldArb,
    shieldArb,
    shieldArb,
    shieldArb,
    fc.tuple(selArb, fmtArb, levelArb).map(([s, f, l]) => new ShieldCmd("SOL", s, f, true, l)),
    unshieldArb,
    unshieldArb,
    unshieldArb,
    sendOutArb,
    sendOutArb,
    fc.constant(new ForgetStorageCmd()),
    fc.tuple(mintArb, fc.constantFrom<"stranger-member" | "owner-unsigned">("stranger-member", "owner-unsigned"))
      .map(([k, v]) => new StrangerDrainCmd(k, v)),
    fc.tuple(mintArb, fc.constantFrom<"shield" | "unshield">("shield", "unshield"), nastyTextArb)
      .map(([k, op, t]) => new GarbageAmountCmd(k, op, t)),
    fc.constant(new UnshieldWhileFrozenCmd()),
  ],
  { maxCommands: MAX_COMMANDS, size: "max" },
);

// ---------------------------------------------------------------------------------------

describe("Brume vault on a mainnet-beta fork", () => {
  beforeAll(async () => {
    const conn = new Connection(inject("forkRpc"), "confirmed");
    const payer = Keypair.generate();
    const whale = Keypair.fromSecretKey(Uint8Array.from(inject("whaleSecretKey")));
    const stranger = Keypair.generate();
    await Promise.all([airdrop(conn, payer.publicKey, 1_000), airdrop(conn, whale.publicKey, 10), airdrop(conn, stranger.publicKey, 10)]);

    const opts = { commitment: "confirmed" as const };
    const spl0 = await createMint(conn, payer, payer.publicKey, null, 0, undefined, opts, TOKEN_PROGRAM_ID);
    const spl9f = await createMint(conn, payer, payer.publicKey, payer.publicKey, 9, undefined, opts, TOKEN_PROGRAM_ID);
    const t22 = await createMint(conn, payer, payer.publicKey, null, 6, undefined, opts, TOKEN_2022_PROGRAM_ID);
    const t22fee = await createTransferFeeMint(conn, payer, 6, 137, 5_000_000n);

    env = {
      conn,
      payer,
      whale,
      stranger,
      rentMin: BigInt(await conn.getMinimumBalanceForRentExemption(0)),
      mints: {
        SOL: { key: "SOL", address: SOL, decimals: 9, programId: SystemProgram.programId, fund: 100n * BigInt(LAMPORTS_PER_SOL) },
        USDC: { key: "USDC", address: inject("usdcMint"), decimals: 6, programId: TOKEN_PROGRAM_ID, fund: 10_000n * 10n ** 6n },
        SPL0: { key: "SPL0", address: spl0.toBase58(), decimals: 0, programId: TOKEN_PROGRAM_ID, fund: 1_000n },
        SPL9F: { key: "SPL9F", address: spl9f.toBase58(), decimals: 9, programId: TOKEN_PROGRAM_ID, fund: 1_000n * 10n ** 9n },
        T22: { key: "T22", address: t22.toBase58(), decimals: 6, programId: TOKEN_2022_PROGRAM_ID, fund: 1_000_000n * 10n ** 6n },
        T22FEE: { key: "T22FEE", address: t22fee.toBase58(), decimals: 6, programId: TOKEN_2022_PROGRAM_ID, fund: 1_000_000n * 10n ** 6n, feeBps: 137, maxFee: 5_000_000n },
      },
    };
  });

  afterAll(() => {
    const lines = [...stats.entries()].sort(([a], [b]) => a.localeCompare(b));
    console.log(`\n[mainnet-fork fuzz] command outcomes (${FUZZ_RUNS} runs, <=${MAX_COMMANDS} commands each)\n` +
      lines.map(([k, n]) => `  ${k.padEnd(48)} ${n}`).join("\n") +
      `\n  max compute units used by one wallet transaction: ${maxCuSeen}`);
  });

  it("fork matches live mainnet: program, config, treasury, creation fee", async () => {
    const { conn } = env;
    const prog = await conn.getAccountInfo(PROGRAM_ID, "confirmed");
    expect(prog?.executable).toBe(true);
    const [configPda] = pda.getProgramConfigPda({});
    const cfg = await accounts.ProgramConfig.fromAccountAddress(conn, configPda, "confirmed");
    const live = inject("mainnetConfig");
    expect(cfg.treasury.toBase58()).toBe(live.treasury);
    expect(cfg.smartAccountCreationFee.toString()).toBe(live.creationFee);
    expect(BigInt(cfg.smartAccountIndex.toString()) >= BigInt(live.smartAccountIndex)).toBe(true);
    const usdc = await conn.getParsedAccountInfo(new PublicKey(inject("usdcMint")), "confirmed");
    expect((usdc.value?.data as { parsed: { info: { decimals: number } } }).parsed.info.decimals).toBe(6);
  });

  it("stateful fuzz: shield / unshield / send / adversarial commands keep every invariant", async () => {
    await fc.assert(
      fc.asyncProperty(commandsArb, async (cmds) => {
        clearStorage();
        const { conn } = env;
        const owner = Keypair.generate();
        await airdrop(conn, owner.publicKey, Number(env.mints.SOL.fund / BigInt(LAMPORTS_PER_SOL)));
        const opts = { commitment: "confirmed" as const };
        for (const key of ["SPL0", "SPL9F", "T22", "T22FEE"] as MintKey[]) {
          const s = env.mints[key];
          const mint = new PublicKey(s.address);
          const ata = await getOrCreateAssociatedTokenAccount(conn, env.payer, mint, owner.publicKey, false, "confirmed", undefined, s.programId);
          await mintTo(conn, env.payer, mint, ata.address, env.payer, s.fund, [], opts, s.programId);
        }
        const usdc = new PublicKey(env.mints.USDC.address);
        const ownerUsdc = await getOrCreateAssociatedTokenAccount(conn, env.payer, usdc, owner.publicKey, false, "confirmed");
        const whaleUsdc = getAssociatedTokenAddressSync(usdc, env.whale.publicKey);
        await transferChecked(conn, env.whale, whaleUsdc, usdc, ownerUsdc.address, env.whale, env.mints.USDC.fund, 6, [], opts);

        const model: Model = {
          settings: null,
          vault: { SOL: 0n, USDC: 0n, SPL0: 0n, SPL9F: 0n, T22: 0n, T22FEE: 0n },
          wallet: { SOL: 0n, USDC: env.mints.USDC.fund, SPL0: env.mints.SPL0.fund, SPL9F: env.mints.SPL9F.fund, T22: env.mints.T22.fund, T22FEE: env.mints.T22FEE.fund },
          recipients: new Map(),
          vaultAtas: new Set(),
        };
        const real: Real = { conn, owner, recipients: [Keypair.generate(), Keypair.generate(), Keypair.generate()] };
        await fc.asyncModelRun(() => ({ model, real }), cmds);
        if (process.env.FUZZ_TRACE === "1") console.log(`[run] ${String(cmds)}`);
      }),
      {
        numRuns: FUZZ_RUNS,
        endOnFailure: process.env.FUZZ_SHRINK !== "1",
        verbose: 1,
        ...(process.env.FC_SEED ? { seed: Number(process.env.FC_SEED) } : {}),
        ...(process.env.FC_PATH ? { path: process.env.FC_PATH } : {}),
      },
    );
  });
});
