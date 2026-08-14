
export function isMainTabPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/shield" ||
    pathname === "/nfts" ||
    pathname === "/activity" ||
    pathname === "/settings"
  );
}

// outer outlet does not remount; motion stays inside MainShell.

export function outletPresenceKey(pathname: string): string {
  if (isMainTabPath(pathname)) return "__main__";

  if (pathname.startsWith("/token/")) return "__main__";
  if (pathname === "/accounts" || pathname.startsWith("/accounts/")) {
    return "__main__";
  }
  return pathname;
}

// `/send` + nested send flow, and token detail (same slide-up / fade as send).

export function isSendPath(pathname: string): boolean {
  return (
    pathname === "/send" ||
    pathname.startsWith("/send/") ||
    pathname.startsWith("/token/")
  );
}

// `/accounts` list (not add/edit/private-key).

export function isManageAccountsPath(pathname: string): boolean {
  return pathname === "/accounts";
}

export function isAccountSubpagePath(pathname: string): boolean {
  return (
    pathname === "/accounts/add" ||
    pathname === "/accounts/add-hd" ||
    /^\/accounts\/[^/]+\/edit$/.test(pathname) ||
    pathname.endsWith("/private-key")
  );
}
