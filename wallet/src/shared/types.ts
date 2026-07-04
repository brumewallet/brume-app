import type { ExplorerId, NetworkId } from "./constants";
import type { PortfolioTokenRow } from "@brume/shared";
export type { PortfolioTokenRow };

// Extension ↔ popup / content message envelope

export type ExtensionMessage =
  | { type: "GET_STATE"; requestId: string }
  | { type: "GET_STATE_RESPONSE"; requestId: string; payload: WalletUiState }
  | { type: "ACTIVITY_HEARTBEAT"; requestId: string }
  | { type: "GET_AUTO_LOCK_TIMEOUT"; requestId: string }
  | {
      type: "SET_AUTO_LOCK_TIMEOUT";
      requestId: string;
      payload: { minutes: number };
    }
  | {
      type: "CREATE_WALLET";
      requestId: string;
      payload: { mnemonic: string; password?: string };
    }
  | {
      type: "IMPORT_WALLET";
      requestId: string;
      payload: { mnemonic: string; password?: string };
    }
  | {
      type: "IMPORT_PRIVATE_KEY";
      requestId: string;
      payload: { secretKeyInput: string; password?: string };
    }
  | {
      type: "ADD_HD_ACCOUNT";
      requestId: string;
      payload: { password?: string };
    }
  | {
      type: "UNLOCK";
      requestId: string;
      payload: { password: string };
    }
  | {
      type: "SWITCH_ACCOUNT";
      requestId: string;
      payload: { accountId: string };
    }
  | {
      type: "RENAME_ACCOUNT";
      requestId: string;
      payload: { accountId: string; label: string };
    }
  | { type: "REMOVE_ACCOUNT"; requestId: string; payload: { accountId: string } }
  | { type: "LOCK"; requestId: string }
  | {
      type: "SET_SIMPLE_MODE";
      requestId: string;
      payload: { simpleMode: boolean };
    }
  | { type: "SET_NETWORK"; requestId: string; payload: { network: NetworkId } }
  | {
      type: "SET_RPC_URL_OVERRIDE";
      requestId: string;
      payload: { rpcUrl: string | null };
    }
  | {
      type: "SET_EXPLORER_ID";
      requestId: string;
      payload: { explorerId: ExplorerId };
    }
  | {
      type: "SET_UI_SURFACE";
      requestId: string;
      payload: { surface: "popup" | "sidepanel" };
    }
  | { type: "REFRESH_BALANCE"; requestId: string }
  | {
      type: "SEND_SOL";
      requestId: string;
      payload: { to: string; sol: string };
    }
  | {
      type: "SEND_SPL";
      requestId: string;
      payload: {
        mint: string;
        to: string;
                // Human-readable amount (decimal string), same style as SOL send.

        amount: string;
                // Spend from PER ephemeral shielded balance (not base ATA).

        fromPrivateBalance?: boolean;
      };
    }
  | {
      type: "BURN_SPL";
      requestId: string;
      payload: {
        mint: string;
                // Human decimal amount, or `all` to burn full balance and close ATA.

        amount: string;
      };
    }
  | {
      type: "WRAP_SOL";
      requestId: string;
      payload: { amountSol: string };
    }
  | {
      type: "UNWRAP_SOL";
      requestId: string;
      payload: Record<string, never>;
    }
  | {
      type: "GET_NFTS";
      requestId: string;
      payload: { refresh?: boolean };
    }
  | {
      type: "BURN_NFT";
      requestId: string;
      payload: {
        mint: string;
        collection: string | null;
        standard: "mpl-core" | "legacy" | "programmable";
      };
    }
  | {
      type: "GET_SHIELD_BALANCES";
      requestId: string;
      payload: { mint: string };
    }
  | {
      type: "GET_SHIELD_BALANCES_BATCH";
      requestId: string;
      payload: { mints: string[] };
    }
  | {
      type: "SHIELD_SPL";
      requestId: string;
      payload: {
        mode: "shield" | "unshield";
        mint: string;
        amount: string;
      };
    }
  | { type: "REQUEST_AIRDROP"; requestId: string }
  | {
      type: "GET_ACTIVITY";
      requestId: string;
      payload?: { limit?: number; refresh?: boolean };
    }
  | {
      type: "LIST_CONNECTED_SITES";
      requestId: string;
    }
  | {
      type: "DISCONNECT_SITE";
      requestId: string;
      payload: { origin: string };
    }
  | {
      type: "EXPORT_SECRET";
      requestId: string;
      payload: { password?: string };
    }
  | {
      type: "POPUP_APPROVE_CONNECT";
      requestId: string;
      payload: { connectRequestId: string };
    }
  | {
      type: "POPUP_REJECT_CONNECT";
      requestId: string;
      payload: { connectRequestId: string };
    }
  | {
      type: "POPUP_APPROVE_SIGN";
      requestId: string;
      payload: { approvalId: string };
    }
  | {
      type: "POPUP_REJECT_SIGN";
      requestId: string;
      payload: { approvalId: string };
    }
  | {
      type: "DAPP_CONNECT";
      requestId: string;
    }
  | {
      type: "DAPP_DISCONNECT";
      requestId: string;
    }
  | {
      type: "DAPP_SIGN_TRANSACTION";
      requestId: string;
      payload: { serializedTransaction: string };
    }
  | {
      type: "DAPP_SIGN_ALL_TRANSACTIONS";
      requestId: string;
      payload: { serializedTransactions: string[] };
    }
  | {
      type: "DAPP_SIGN_MESSAGE";
      requestId: string;
      payload: { message: string };
    }
  | {
      type: "DAPP_GET_ACCOUNTS";
      requestId: string;
    }
  | { type: "SUCCESS"; requestId: string; payload?: unknown }
  | { type: "ERROR"; requestId: string; payload: { code: number; message: string } };

export interface WalletUiState {
  hasVault: boolean;
  locked: boolean;
  publicKey: string | null;
    // Unlocked or last-selected account (for display while locked).

  activeAccountId: string | null;
  accountLabel: string | null;
  accounts: WalletAccountSnapshot[];
  network: NetworkId;
    // Integer string: SOL balance in smallest units (10⁻⁹ SOL).

  balanceSolBaseUnits: string | null;
    // Last balance/RPC failure (e.g. public RPC 403 from extension context).

  rpcError: string | null;
    // Last Brume indexer (Next API) failure — portfolio metadata; not the Solana RPC.

  indexerError: string | null;
    // When set, used instead of the built-in endpoint for this network.

  rpcUrlOverride: string | null;
    // Preferred block explorer for transaction and account links.

  explorerId: ExplorerId;
    // Fungible tokens from Brume API; null if none / not loaded.

  portfolioTokens: PortfolioTokenRow[] | null;
    // 
  // Last known shielded (ephemeral) balances from MagicBlock Payments API,
  // keyed by mint (smallest units as decimal strings). Persisted in extension storage.

  shieldedBalancesByMint: Record<string, string>;
  simpleMode: boolean;
  pendingConnect: PendingConnectRequest | null;
  pendingSign: PendingSignRequest | null;
  blocklist: string[];
  allowlist: string[];
    // True when the vault can derive another account from the stored BIP39 root (Phantom-style HD).

  hdDerivationAvailable: boolean;
}

export interface PendingConnectRequest {
    // Matches dApp promise id / approval id in popup

  id: string;
  origin: string;
  tabId: number;
}

export interface PendingSignRequest {
    // UI / queue id

  id: string;
    // Original request from injected (for postMessage resolve)

  dappRequestId: string;
  kind: "transaction" | "allTransactions" | "message";
  origin: string;
  tabId: number;
    // Base64 serialized tx or txs

  serializedTransaction?: string;
  serializedTransactions?: string[];
    // Base64 message bytes

  message?: string;
}

export interface StoredKeystore {
  version: 1;
  crypto: {
    cipher: "aes-256-gcm";
    ciphertext: string;
    cipherparams: { iv: string };
    authTag: string;
    kdf: "pbkdf2";
    kdfparams: {
      dklen: number;
      salt: string;
      iterations: number;
      digest: "SHA-256";
    };
  };
  address: string;
}

// One Solana account (encrypted secret + per-site connections).

export interface WalletAccount {
  id: string;
  label: string;
  keystore: StoredKeystore;
  connectedOrigins: Record<string, { publicKey: string; connectedAt: number }>;
}

// Multi-account vault (version 2).

export interface PersistedVault {
  version: 2;
  activeAccountId: string;
  accounts: WalletAccount[];
  network: NetworkId;
  rpcUrlOverride?: string | null;
  explorerId?: ExplorerId;
  allowlist: string[];
  blocklist: string[];
  simpleMode: boolean;
    // Encrypted normalized BIP39 phrase for deriving m/44'/501'/n'/0' siblings.

  encryptedRootMnemonic?: StoredKeystore;
    // Next path account index for HD derivation (account 0 uses index 0).

  hdNextAccountIndex?: number;
}

// @deprecated Single-wallet shape; migrated to PersistedVault on read.

export interface PersistedWallet {
  keystore: StoredKeystore;
  network: NetworkId;
  rpcUrlOverride?: string | null;
  connectedOrigins: Record<string, { publicKey: string; connectedAt: number }>;
  allowlist: string[];
  blocklist: string[];
  simpleMode: boolean;
}

export interface WalletAccountSnapshot {
  id: string;
  label: string;
  address: string;
}

// Injected ↔ content (window.postMessage)

export const BRUME_CHANNEL = "brume_wallet_channel";

export type InjectedRequest =
  | { id: string; method: "connect" }
  | { id: string; method: "disconnect" }
  | { id: string; method: "signTransaction"; transaction: string }
  | { id: string; method: "signAllTransactions"; transactions: string[] }
  | { id: string; method: "signMessage"; message: string }
  | { id: string; method: "getAccounts" };

export type InjectedResponse =
  | { id: string; ok: true; result?: unknown }
  | { id: string; ok: false; error: { code: number; message: string } };
