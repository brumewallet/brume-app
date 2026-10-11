// Keeps the unlocked session across MV3 service-worker restarts.
//
// Chrome stops an idle worker after about 30 s, which drops every module
// variable. Without this, the wallet locked itself whenever the popup was
// closed for a short time, and dApp sign requests failed with "Wallet locked".
//
// chrome.storage.session is held in memory only, is cleared when the browser
// closes, and (with TRUSTED_CONTEXTS) is not readable from content scripts.
import { Keypair } from "@solana/web3.js";
import { base64ToBytes, bytesToBase64 } from "@/shared/crypto";

const SESSION_KEY = "brume_unlocked_session";

export type UnlockedSession = {
  accountId: string;
  password: string | null;
  keypairs: Map<string, Keypair>;
};

type Stored = {
  accountId: string;
  password: string | null;
  secretKeys: Record<string, string>;
};

let accessLevelSet = false;

async function ensureTrustedOnly(): Promise<void> {
  if (accessLevelSet) return;
  accessLevelSet = true;
  try {
    await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch {
    // TRUSTED_CONTEXTS is already the default.
  }
}

export async function saveSession(s: UnlockedSession): Promise<void> {
  await ensureTrustedOnly();
  const secretKeys: Record<string, string> = {};
  for (const [id, kp] of s.keypairs) secretKeys[id] = bytesToBase64(kp.secretKey);
  const stored: Stored = { accountId: s.accountId, password: s.password, secretKeys };
  await chrome.storage.session.set({ [SESSION_KEY]: stored });
}

export async function loadSession(): Promise<UnlockedSession | null> {
  await ensureTrustedOnly();
  const raw = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as Stored | undefined;
  if (!raw || typeof raw.accountId !== "string" || !raw.secretKeys) return null;
  const keypairs = new Map<string, Keypair>();
  try {
    for (const [id, b64] of Object.entries(raw.secretKeys)) {
      keypairs.set(id, Keypair.fromSecretKey(base64ToBytes(b64)));
    }
  } catch {
    await clearSession();
    return null;
  }
  if (!keypairs.has(raw.accountId)) return null;
  return { accountId: raw.accountId, password: raw.password ?? null, keypairs };
}

export async function clearSession(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY);
}
