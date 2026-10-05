// Fixed-window limiter kept in process memory; each server instance counts on its own.
type Window = { start: number; count: number };

export type RateLimitResult = { ok: boolean; limit: number; remaining: number; resetMs: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const windows = new Map<string, Window>();

  function sweep(now: number) {
    for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
  }

  return function take(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    if (windows.size > 10_000) sweep(now);
    let w = windows.get(key);
    if (!w || now - w.start >= windowMs) {
      w = { start: now, count: 0 };
      windows.set(key, w);
    }
    const resetMs = w.start + windowMs - now;
    if (w.count + cost > limit) return { ok: false, limit, remaining: Math.max(0, limit - w.count), resetMs };
    w.count += cost;
    return { ok: true, limit, remaining: limit - w.count, resetMs };
  };
}

// Client IP from proxy headers; falls back to one shared bucket when none is present.
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip")?.trim() || "unknown";
}
