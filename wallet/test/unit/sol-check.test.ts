// Pre-send SOL check for shield, send and Earn; the numbers come from a real first-shield shortfall on mainnet.
import { Keypair, PublicKey, SystemProgram, Transaction, type Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { assertEnoughSol } from "@/background/sol-check";

const payer = Keypair.generate().publicKey;

function shieldTx(): Transaction {
  return new Transaction({ feePayer: payer, recentBlockhash: PublicKey.default.toBase58() }).add(
    SystemProgram.transfer({ fromPubkey: payer, toPubkey: Keypair.generate().publicKey, lamports: 1_015_020 }),
  );
}

function fakeConn(sim: { err: unknown; logs: string[] } | Error, balance = 2_030_032): Connection {
  return {
    simulateTransaction: async () => {
      if (sim instanceof Error) throw sim;
      return { context: { slot: 1 }, value: sim };
    },
    getBalance: async () => balance,
  } as unknown as Connection;
}

describe("assertEnoughSol", () => {
  it("throws the full amount to add when a transfer runs out of SOL", async () => {
    const conn = fakeConn({
      err: { InstructionError: [3, { Custom: 1 }] },
      logs: ["Transfer: insufficient lamports 520952, need 1015020"],
    });
    await expect(assertEnoughSol(conn, payer, shieldTx())).rejects.toThrow(
      "Not enough SOL. This transaction needs at least 0.0025241 SOL, including network fees and rent for any " +
        "new accounts. Your wallet has 0.002030032 SOL. Add at least 0.000494068 SOL or use a smaller amount.",
    );
  });

  it("names the fee payer when it is not the wallet", async () => {
    const conn = fakeConn({ err: { InstructionError: [0, { Custom: 1 }] }, logs: ["Transfer: insufficient lamports 5000, need 9000"] }, 5000);
    await expect(assertEnoughSol(conn, payer, shieldTx(), "The Earn automation key")).rejects.toThrow(
      "The Earn automation key has 0.000005 SOL.",
    );
  });

  it("passes when the simulation succeeds", async () => {
    await expect(assertEnoughSol(fakeConn({ err: null, logs: [] }), payer, shieldTx())).resolves.toBeUndefined();
  });

  it("leaves other failures to the send preflight", async () => {
    const conn = fakeConn({ err: { InstructionError: [2, { Custom: 6000 }] }, logs: ["custom program error: 0x1770"] });
    await expect(assertEnoughSol(conn, payer, shieldTx())).resolves.toBeUndefined();
  });

  it("does not block the send when the simulation call fails", async () => {
    await expect(assertEnoughSol(fakeConn(new Error("RPC down")), payer, shieldTx())).resolves.toBeUndefined();
  });
});
