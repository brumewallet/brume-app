// Disclosure and implementation must move together.

export type DisclosureState = "private" | "public" | "trust" | "roadmap";

export type DisclosureItem = {
  id: string;
  label: string;
  body: string;
  state: DisclosureState;
};

export const DISCLOSURE_ITEMS: DisclosureItem[] = [
  {
    id: "private-balances",
    label: "Shielded balances",
    body: "Your shielded token balance is not visible on-chain. The pool holds an omnibus vault; no external observer can tell how much any individual address has deposited or whether it has been spent.",
    state: "private",
  },
  {
    id: "private-counterparties",
    label: "Transfer amounts and counterparties",
    body: "When you send tokens through the shielded pool, the recipient address and the amount are not visible on-chain. Only you and the recipient can link the transfer to your addresses.",
    state: "private",
  },
  {
    id: "private-note-contents",
    label: "Note contents",
    body: "Each shielded deposit is recorded as an encrypted note announcement on-chain. The note plaintext - amount, mint, and your secret keys - is encrypted with your X-Wing post-quantum key and is only readable by you.",
    state: "private",
  },
  {
    id: "public-entry",
    label: "Shield events (entry)",
    body: "When you shield tokens, the chain records that some address moved X tokens into the Brume pool at a specific time. Your address and the amount are publicly visible at the point of entry.",
    state: "public",
  },
  {
    id: "public-exit",
    label: "Unshield events (exit)",
    body: "When you unshield tokens, the chain records that some address received Y tokens from the Brume pool. The recipient address and amount are publicly visible at the point of exit.",
    state: "public",
  },
  {
    id: "public-pool-totals",
    label: "Pool totals and timing",
    body: "The total tokens locked in the pool vault and the timestamp of every shield and unshield operation are publicly visible. Pool-wide statistics cannot be suppressed.",
    state: "public",
  },
  {
    id: "trust-tee",
    label: "Phase 1: TEE trust assumption",
    body: "Brume Phase 1 uses a MagicBlock Intel TDX Trusted Execution Environment (TEE) to validate shielded operations. The enclave sees witnesses during proving - it does not hold your funds or your spend keys. If the enclave key were compromised, an attacker could forge attestations and extract pool funds, but cannot access your wallet keys or deanonymize past activity. This is the current trust model; we disclose it plainly.",
    state: "trust",
  },
  {
    id: "roadmap-zk",
    label: "Phase 2: zero-knowledge proofs",
    body: "Phase 2 replaces the TEE attestation with a Groth16 zero-knowledge proof, removing the TEE trust assumption entirely. The state model (commitment tree, nullifier set, note announcements) is identical, so existing shielded notes will remain spendable after the upgrade.",
    state: "roadmap",
  },
  {
    id: "devnet-only",
    label: "Devnet only (current status)",
    body: "The on-chain shielded pool is deployed to Solana Devnet. Shield and unshield are not available on mainnet yet. All shielded balances on devnet are test tokens with no real-world value.",
    state: "public",
  },
];
