// Readable error text for failed transactions; the logs come from a real first-shield failure on mainnet.
import { SendTransactionError } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { detailedTransactionFailureMessage, insufficientSolMessage, messageFromUnknown } from "@/shared/errors";

const logs = [
  "Program 11111111111111111111111111111111 success",
  "Program SMRTzfY6DfH5ik3TKiyLFfXexV8uSG3d2UksSCYdunG success",
  "Program 11111111111111111111111111111111 invoke [1]",
  "Transfer: insufficient lamports 520952, need 1015020",
  "Program 11111111111111111111111111111111 failed: custom program error: 0x1",
];

const expected =
  "Not enough SOL. This step needs 0.00101502 SOL, but only 0.000520952 SOL is left after network fees " +
  "and account setup. Add at least 0.000494068 SOL or use a smaller amount.";

function simulationError() {
  return new SendTransactionError({
    action: "simulate",
    signature: "",
    transactionMessage: "Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1",
    logs,
  });
}

describe("insufficient SOL errors", () => {
  it("reads the amounts from the System Program log", () => {
    expect(insufficientSolMessage(logs.join("\n"))).toBe(expected);
  });

  it("returns null for other failures", () => {
    expect(insufficientSolMessage("custom program error: 0x1")).toBeNull();
  });

  it("replaces the raw simulation error in messageFromUnknown", () => {
    expect(messageFromUnknown(simulationError())).toBe(expected);
  });

  it("replaces the raw simulation error in detailedTransactionFailureMessage", async () => {
    await expect(detailedTransactionFailureMessage(simulationError(), null)).resolves.toBe(expected);
  });
});
