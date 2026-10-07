import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Who may use the WhatsApp page. Whoever links a phone there becomes the
 * lodge's WhatsApp, and the controls can log the lodge out — so with
 * WHATSAPP_ADMIN_PASSWORD set, the page asks for it first and remembers the
 * answer in a signed, HttpOnly cookie. Without it the QR stays reachable as
 * before, but logout and restart are refused.
 */

export const ADMIN_COOKIE = "fc_wa_admin";
export const ADMIN_COOKIE_MAX_AGE = 12 * 60 * 60; // seconds

/** The cookie's value: proof of the password without containing it. Changing the password signs everyone out. */
export function adminToken(password: string): string {
  return createHmac("sha256", password).update("forest-creek whatsapp admin v1").digest("hex");
}

function sameText(a: string, b: string): boolean {
  // Compared as fixed-length digests, so neither length nor content leaks through timing.
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function passwordMatches(given: string, password: string): boolean {
  return sameText(given, password);
}

export function cookieAuthorizes(cookie: string | undefined, password: string): boolean {
  return typeof cookie === "string" && cookie.length > 0 && sameText(cookie, adminToken(password));
}

/**
 * At most `limit` wrong passwords per address per window, so the page cannot
 * be guessed at. In memory: one agent process, and a restart only resets it.
 */
export function createLoginLimiter(limit = 8, windowMs = 15 * 60_000, now: () => number = Date.now) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    blocked(address: string): boolean {
      const entry = failures.get(address);
      if (!entry || entry.resetAt <= now()) return false;
      return entry.count >= limit;
    },
    fail(address: string): void {
      const entry = failures.get(address);
      if (!entry || entry.resetAt <= now()) failures.set(address, { count: 1, resetAt: now() + windowMs });
      else entry.count++;
    },
    succeed(address: string): void {
      failures.delete(address);
    },
  };
}
