import { describe, expect, test } from "bun:test";

import { clientAddress, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  test("allows the limit, then refuses with the time left in the window", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.hit("a", 0).ok).toBe(true);
    expect(limiter.hit("a", 1_000).ok).toBe(true);
    expect(limiter.hit("a", 2_000).ok).toBe(true);
    expect(limiter.hit("a", 10_000)).toEqual({ ok: false, retryAfterMs: 50_000 });
  });

  test("counts each key separately", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.hit("a", 0).ok).toBe(true);
    expect(limiter.hit("b", 0).ok).toBe(true);
    expect(limiter.hit("a", 0).ok).toBe(false);
  });

  test("starts afresh once the window has passed", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    limiter.hit("a", 0);
    expect(limiter.hit("a", 59_999).ok).toBe(false);
    expect(limiter.hit("a", 60_000).ok).toBe(true);
  });

  test("forgets finished windows, so one-off callers do not pile up", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000 });
    for (let i = 0; i < 100; i++) limiter.hit(`ip-${i}`, 0);
    expect(limiter.size()).toBe(100);
    limiter.hit("late", 5_000);
    expect(limiter.size()).toBe(1);
  });
});

describe("clientAddress", () => {
  test("takes the hop the proxy appended, not the one the client claimed", () => {
    expect(clientAddress("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });

  test("uses the socket address with no proxy in front", () => {
    expect(clientAddress(null, "127.0.0.1")).toBe("127.0.0.1");
  });

  test("never returns an empty key", () => {
    expect(clientAddress(" , ")).toBe("unknown");
  });
});
