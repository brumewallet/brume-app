// The API fetches RPC URLs that the wallet sends (the user's custom RPC).
// Only public HTTPS hosts are allowed, so a request cannot make the server
// reach localhost, a private network, or a cloud metadata address (SSRF).
// DNS names that resolve to private addresses are not caught here.

function isBlockedIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPublicHttpsUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[")) return false; // IPv6 literal
  if (!host.includes(".")) return false; // localhost, single-label intranet names
  if (/\.(localhost|local|internal|lan|home|corp)$/.test(host)) return false;
  return !isBlockedIpv4(host);
}
