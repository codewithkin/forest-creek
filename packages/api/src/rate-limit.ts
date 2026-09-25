/**
 * A fixed-window counter per key, in memory. Import-free so it is unit tested
 * with a fake clock.
 *
 * In memory is enough here: the API runs as one process, and what this stops
 * — a script creating bookings in a loop, or pushing EcoCash PIN prompts at
 * somebody's phone — needs a limit that holds for minutes, not one that
 * survives a restart.
 */
export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export type RateLimiter = {
  hit(key: string, now?: number): RateLimitResult;
  /** How many keys are being tracked — for the test that proves they are swept. */
  size(): number;
};

export function createRateLimiter(rule: RateLimitRule): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = 0;

  // Drop finished windows now and then, so a stream of one-off IPs cannot
  // grow the map without bound.
  function sweep(now: number) {
    if (now - lastSweep < rule.windowMs) return;
    lastSweep = now;
    for (const [key, window] of windows) {
      if (now - window.start >= rule.windowMs) windows.delete(key);
    }
  }

  return {
    hit(key, now = Date.now()) {
      sweep(now);
      const window = windows.get(key);
      if (!window || now - window.start >= rule.windowMs) {
        windows.set(key, { start: now, count: 1 });
        return { ok: true };
      }
      if (window.count >= rule.limit) {
        return { ok: false, retryAfterMs: window.start + rule.windowMs - now };
      }
      window.count++;
      return { ok: true };
    },
    size: () => windows.size,
  };
}

/**
 * The client's address as the edge proxy saw it. Behind Coolify's Traefik the
 * proxy APPENDS the connecting address to X-Forwarded-For, so the last entry
 * is the one a client cannot forge — the first is whatever the client sent.
 * With no proxy header (local dev) the socket address is used.
 */
export function clientAddress(forwardedFor: string | null | undefined, socketAddress?: string): string {
  const hops = (forwardedFor ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.at(-1) ?? socketAddress ?? "unknown";
}
