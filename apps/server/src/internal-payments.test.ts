import { describe, expect, test } from "bun:test";

import { BookingError, type InitiatePaymentResult } from "@forest-creek/db";

import { internalPaymentsRoute } from "./internal-payments";

const KEY = "a-shared-agent-key-123";
const sent: InitiatePaymentResult = { ok: true, reference: "FC-ABC123", amountUsd: 60, kind: "deposit", balanceAfter: 60, instructions: "Dial *151#" };

function route(initiate = async () => sent) {
  const calls: unknown[][] = [];
  const app = internalPaymentsRoute({
    apiKey: KEY,
    initiate: async (...args) => {
      calls.push(args);
      return initiate();
    },
    check: async () => ({ ok: true, paid: false, bookingStatus: "pending", paymentStatus: "processing", amountPaid: 0, balanceDue: 120 }),
  });
  return { app, calls };
}

const post = (app: ReturnType<typeof internalPaymentsRoute>, path: string, body: unknown, key: string | null = KEY) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
  });

describe("the agent's charge route", () => {
  test("starts the charge with this server's gateway when the key matches", async () => {
    const { app, calls } = route();
    const res = await post(app, "/mobile-money/initiate", { reference: "FC-ABC123", phone: "0771111111", payInFull: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(sent as never);
    expect(calls).toEqual([["FC-ABC123", "0771111111", { payInFull: true }]]);
  });

  test("refuses without the key, with a wrong key, and when no key is configured", async () => {
    const { app, calls } = route();
    expect((await post(app, "/mobile-money/initiate", { reference: "FC-ABC123", phone: "0771111111" }, null)).status).toBe(401);
    expect((await post(app, "/mobile-money/initiate", { reference: "FC-ABC123", phone: "0771111111" }, "wrong")).status).toBe(401);
    const unset = internalPaymentsRoute({ apiKey: undefined, initiate: async () => sent, check: async () => ({ ok: false, error: "x" }) });
    expect((await post(unset, "/mobile-money/initiate", { reference: "FC-ABC123", phone: "0771111111" })).status).toBe(503);
    expect(calls).toEqual([]);
  });

  test("a booking refusal is an answer (200, ok: false); a crash is a 500 with nothing leaked", async () => {
    const refused = route(async () => {
      throw new BookingError("Those nights are no longer available.", "ROOM_UNAVAILABLE");
    });
    const res = await post(refused.app, "/mobile-money/initiate", { reference: "FC-ABC123", phone: "0771111111" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: "Those nights are no longer available.", code: "ROOM_UNAVAILABLE" });

    const crashed = route(async () => {
      throw new Error("connect ECONNREFUSED guest@example.com");
    });
    const bad = await post(crashed.app, "/mobile-money/initiate", { reference: "FC-ABC123", phone: "0771111111" });
    expect(bad.status).toBe(500);
    expect(JSON.stringify(await bad.json())).not.toContain("example.com");
  });

  test("checks a charge, and turns away a body without a reference", async () => {
    const { app } = route();
    const res = await post(app, "/mobile-money/check", { reference: "FC-ABC123" });
    expect(((await res.json()) as { paid: boolean }).paid).toBe(false);
    expect((await post(app, "/mobile-money/check", {})).status).toBe(400);
  });
});
