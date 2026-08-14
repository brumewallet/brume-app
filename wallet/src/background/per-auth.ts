import type { PublicKey } from "@solana/web3.js";
import { encodeBase58 } from "@/shared/base58";

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

function formatJsonError(err: unknown): string {
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function getPerAuthToken(
  rpcUrl: string,
  publicKey: PublicKey,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
): Promise<{ token: string; expiresAt: number }> {
  const base = rpcUrl.replace(/\/+$/, "");
  const pk = publicKey.toBase58();

  const challengeResponse = await fetch(
    `${base}/auth/challenge?pubkey=${encodeURIComponent(pk)}`,
  );
  const challengeJson = (await challengeResponse.json()) as {
    challenge?: string;
    error?: unknown;
  };

  const chErr = challengeJson.error;
  if (chErr != null && String(chErr).length > 0) {
    if (typeof chErr === "string") {
      throw new Error(`Failed to get challenge: ${chErr}`);
    }
    throw new Error(`Failed to get challenge: ${formatJsonError(chErr)}`);
  }

  const challenge = challengeJson.challenge;
  if (typeof challenge !== "string" || challenge.length === 0) {
    throw new Error("No challenge received");
  }

  const signature = await signMessage(new TextEncoder().encode(challenge));
  const signatureString = encodeBase58(signature);

  const authResponse = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pubkey: pk,
      challenge,
      signature: signatureString,
    }),
  });

  const authJson = (await authResponse.json()) as {
    token?: string;
    expiresAt?: number;
    error?: unknown;
  };

  if (authResponse.status !== 200) {
    throw new Error(
      `Failed to authenticate: ${formatJsonError(authJson.error ?? authJson)}`,
    );
  }

  const token = authJson.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("No token received");
  }

  const expiresAt =
    typeof authJson.expiresAt === "number"
      ? authJson.expiresAt
      : Date.now() + SESSION_DURATION_MS;

  return { token, expiresAt };
}
