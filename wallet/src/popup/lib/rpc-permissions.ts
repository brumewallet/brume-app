
export async function ensureRpcHostPermission(rpcUrl: string): Promise<boolean> {
  try {
    const u = new URL(rpcUrl.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return false;
    }
    const origins = [`${u.origin}/*`];
    const has = await chrome.permissions.contains({ origins });
    if (has) return true;
    return await chrome.permissions.request({ origins });
  } catch {
    return false;
  }
}
