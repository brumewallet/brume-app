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
    id: "private-root-control",
    label: "Your keys and root control",
    body: "Shield moves tokens into a vault of a Loyal Smart Account (Squads Smart Account Program). Your wallet key is the only signer, with a threshold of 1 and no time lock. Brume and Loyal do not hold a key that can move your vault funds.",
    state: "private",
  },
  {
    id: "public-vault-balances",
    label: "Shielded balances",
    body: "The vault is a normal on-chain account. Anyone who knows the vault address can see its balance. Shield keeps funds separate from your main wallet balance. It does not hide the amount.",
    state: "public",
  },
  {
    id: "public-link",
    label: "Wallet-to-vault link",
    body: "The Smart Account settings account lists your wallet address as its signer. An observer can link your wallet to your vault.",
    state: "public",
  },
  {
    id: "public-entry",
    label: "Shield events (entry)",
    body: "When you shield tokens, the chain records a transfer from your wallet to your vault. The amount and the time are publicly visible.",
    state: "public",
  },
  {
    id: "public-exit",
    label: "Unshield and vault sends (exit)",
    body: "When you unshield or send from your shielded balance, the chain records a transfer from your vault. The recipient address and the amount are publicly visible.",
    state: "public",
  },
  {
    id: "trust-program",
    label: "Smart Account program trust assumption",
    body: "Vault safety depends on the Squads Smart Account Program and on its upgrade authority. Brume stores your vault address on this device. If that record is lost, Brume finds the vault again from on-chain data.",
    state: "trust",
  },
  {
    id: "roadmap-privacy",
    label: "Private balances and transfers",
    body: "The current version does not hide balances, amounts, or counterparties. A privacy layer is not part of this release.",
    state: "roadmap",
  },
  {
    id: "devnet-only",
    label: "Devnet only (current status)",
    body: "Shield and unshield are available on Solana Devnet only. All shielded balances on devnet are test tokens with no real-world value.",
    state: "public",
  },
];
