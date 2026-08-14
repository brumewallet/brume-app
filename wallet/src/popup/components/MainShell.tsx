import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import {
  isAccountSubpagePath,
  isMainTabPath,
  isManageAccountsPath,
} from "../lib/account-routes";
import { BottomNav } from "./BottomNav";
import { MainShellHeader } from "./MainShellHeader";
import { isUnlockConfettiActive, UnlockConfettiHost } from "./UnlockConfettiHost";
import {
  RouteContentFade,
  type RouteContentVariant,
} from "./RouteContentFade";
import * as msg from "../messaging";

function mainNavVariant(pathname: string): RouteContentVariant {
  if (pathname === "/") return "home";
  if (
    pathname === "/shield" ||
    pathname === "/activity" ||
    pathname === "/settings"
  ) {
    return "secondaryNav";
  }
  return "fade";
}

function accountAreaVariant(pathname: string): RouteContentVariant {
  if (isManageAccountsPath(pathname)) return "manageAccounts";
  if (isAccountSubpagePath(pathname)) return "accountSubpage";
  return "fade";
}

function mainShellVariant(pathname: string): RouteContentVariant {
  if (isMainTabPath(pathname)) return mainNavVariant(pathname);
  if (pathname.startsWith("/token/")) return "send";
  return accountAreaVariant(pathname);
}

export function MainShell() {
  const { pathname, key: locationKey } = useLocation();
  const tokenDetailOpen = pathname.startsWith("/token/");
  const lastTouchRef = useRef(0);
  const [showUnlockSkeleton, setShowUnlockSkeleton] = useState(false);

  useEffect(() => {
    let alive = true;

    function touch() {
      if (!alive) return;
      const now = Date.now();
      if (now - lastTouchRef.current < 10_000) return;
      lastTouchRef.current = now;
      void msg.activityHeartbeat();
    }

    touch();

    const onPointer = () => touch();
    const onKey = () => touch();
    const onFocus = () => touch();

    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focus", onFocus);

    const interval = window.setInterval(() => touch(), 30_000);
    return () => {
      alive = false;
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [pathname]);

  useEffect(() => {
    setShowUnlockSkeleton(isUnlockConfettiActive());
    const t = window.setInterval(() => {
      const active = isUnlockConfettiActive();
      setShowUnlockSkeleton(active);
      if (!active) window.clearInterval(t);
    }, 100);
    return () => window.clearInterval(t);
  }, [pathname]);

  return (
    <div className="flex min-h-0 w-full min-w-[360px] flex-1 flex-col overflow-hidden bg-background">
      <UnlockConfettiHost />
      {isMainTabPath(pathname) ? <MainShellHeader /> : null}
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <RouteContentFade
          routeKey={`${pathname}:${locationKey}`}
          variant={mainShellVariant(pathname)}
          className="flex min-h-min flex-col"
        >
          <Outlet />
        </RouteContentFade>
        {showUnlockSkeleton ? (
          <div className="pointer-events-none absolute inset-0 z-[30] bg-background">
            <div className="flex h-full flex-col gap-4 px-5 py-6">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted brume-skeleton-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-32 rounded bg-muted brume-skeleton-pulse" />
                  <div className="mt-2 h-3 w-44 rounded bg-muted brume-skeleton-pulse" />
                </div>
              </div>
              <div className="mt-4 h-24 rounded-2xl bg-muted brume-skeleton-pulse" />
              <div className="h-24 rounded-2xl bg-muted brume-skeleton-pulse" />
              <div className="h-24 rounded-2xl bg-muted brume-skeleton-pulse" />
            </div>
          </div>
        ) : null}
      </main>
      {tokenDetailOpen ? null : <BottomNav />}
    </div>
  );
}
