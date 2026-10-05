// Starts solana-test-validator forked from mainnet-beta for the mainnet-fork fuzz suite.
//
// Cloned from mainnet: the Squads Smart Account program (the exact bytecode Loyal uses on
// mainnet), its ProgramConfig account (real global index, treasury, creation fee), the
// USDC mint, and the current Token-2022 program. A "whale" USDC token account is injected
// so tests can move real-mainnet-shaped USDC.
//
// Env:
//   BRUME_FORK_SOURCE_RPC  mainnet RPC to clone from (default: public mainnet-beta)
//   BRUME_FORK_PORT        base port (default 18899; uses base..base+40)
//   BRUME_FORK_KEEP=1      keep the ledger directory after the run
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AccountLayout, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { TestProject } from "vitest/node";

export const SQUADS_SMART_ACCOUNT_PROGRAM = "SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG";
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const WHALE_USDC_RAW = 1_000_000_000_000n; // 1,000,000 USDC

declare module "vitest" {
  export interface ProvidedContext {
    forkRpc: string;
    whaleSecretKey: number[];
    usdcMint: string;
    mainnetConfig: { treasury: string; creationFee: string; smartAccountIndex: string };
  }
}

async function waitForRpc(url: string, proc: ChildProcess, logFile: string): Promise<void> {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    if (proc.exitCode != null) break;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      const body = (await res.json()) as { result?: string };
      if (body.result === "ok") return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const tail = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, "utf8").split("\n").slice(-30).join("\n")
    : "(no log)";
  throw new Error(`mainnet-fork validator did not become healthy.\n${tail}`);
}

export default async function setup(project: TestProject) {
  const sourceRpc = process.env.BRUME_FORK_SOURCE_RPC ?? "https://api.mainnet-beta.solana.com";
  const base = Number(process.env.BRUME_FORK_PORT ?? 18899);
  const ledger = fs.mkdtempSync(path.join(os.tmpdir(), "brume-mainnet-fork-"));
  const logFile = path.join(ledger, "validator.log");

  // Record what mainnet looks like right now, so the suite can assert the fork matches it.
  const { accounts, pda } = await import("@loyal-labs/loyal-smart-accounts");
  const [configPda] = pda.getProgramConfigPda({});
  const live = await accounts.ProgramConfig.fromAccountAddress(
    new Connection(sourceRpc, "confirmed"),
    configPda,
  );

  const whale = Keypair.generate();
  const usdc = new PublicKey(MAINNET_USDC_MINT);
  const whaleAta = getAssociatedTokenAddressSync(usdc, whale.publicKey);
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint: usdc,
      owner: whale.publicKey,
      amount: WHALE_USDC_RAW,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  const whaleAtaFile = path.join(ledger, "whale-usdc-ata.json");
  fs.writeFileSync(
    whaleAtaFile,
    JSON.stringify({
      pubkey: whaleAta.toBase58(),
      account: {
        lamports: 2_039_280,
        data: [data.toString("base64"), "base64"],
        owner: TOKEN_PROGRAM,
        executable: false,
        rentEpoch: 0,
        space: AccountLayout.span,
      },
    }),
  );

  const args = [
    "--ledger", path.join(ledger, "ledger"),
    "--reset",
    "--quiet",
    "--bind-address", "127.0.0.1",
    "--rpc-port", String(base),
    "--faucet-port", String(base + 2),
    "--gossip-port", String(base + 3),
    "--dynamic-port-range", `${base + 10}-${base + 40}`,
    "--url", sourceRpc,
    "--clone-upgradeable-program", SQUADS_SMART_ACCOUNT_PROGRAM,
    "--clone", configPda.toBase58(),
    "--clone", MAINNET_USDC_MINT,
    "--clone-upgradeable-program", TOKEN_2022_PROGRAM,
    "--account", whaleAta.toBase58(), whaleAtaFile,
  ];
  const log = fs.openSync(logFile, "a");
  const proc = spawn("solana-test-validator", args, { stdio: ["ignore", log, log] });

  const forkRpc = `http://127.0.0.1:${base}`;
  try {
    await waitForRpc(forkRpc, proc, logFile);
  } catch (e) {
    proc.kill("SIGKILL");
    throw e;
  }

  project.provide("forkRpc", forkRpc);
  project.provide("whaleSecretKey", [...whale.secretKey]);
  project.provide("usdcMint", MAINNET_USDC_MINT);
  project.provide("mainnetConfig", {
    treasury: live.treasury.toBase58(),
    creationFee: live.smartAccountCreationFee.toString(),
    smartAccountIndex: live.smartAccountIndex.toString(),
  });

  return async () => {
    proc.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
    if (proc.exitCode == null) proc.kill("SIGKILL");
    if (process.env.BRUME_FORK_KEEP !== "1") {
      fs.rmSync(ledger, { recursive: true, force: true });
    } else {
      console.log(`[mainnet-fork] ledger kept at ${ledger}`);
    }
  };
}
