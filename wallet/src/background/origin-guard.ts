export type OriginDecision = "allowed" | "blocked" | "prompt";

export function validateOrigin(
  origin: string,
  allowlist: string[],
  blocklist: string[],
): OriginDecision {
  if (blocklist.includes(origin)) return "blocked";
  if (allowlist.includes(origin)) return "allowed";
  return "prompt";
}

// Web pages reach the background only through the content script, which forwards
// DAPP_* requests. Every other message controls the wallet (unlock, export key,
// approve a signature) and must come from a Brume extension page.
export function isAllowedSender(
  messageType: string,
  senderUrl: string | undefined,
  extensionOrigin: string,
): boolean {
  if (messageType.startsWith("DAPP_")) return true;
  return !!senderUrl && senderUrl.startsWith(extensionOrigin);
}
