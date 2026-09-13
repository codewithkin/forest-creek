import { describe, expect, test } from "bun:test";

import {
  initiateMobilePayment,
  pollPayment,
  type PaynowClient,
  type PaynowResponse,
} from "./gateway";

const input = {
  reference: "FC-ABC123",
  amountUsd: 180,
  guestEmail: "guest@example.com",
  phone: "0777000000",
  method: "ecocash" as const,
};

function fakeClient(response: PaynowResponse | Error): PaynowClient {
  const respond = async () => {
    if (response instanceof Error) throw response;
    return response;
  };
  return {
    createPayment: () => ({ add: () => undefined }),
    sendMobile: respond,
    pollTransaction: respond,
  };
}

describe("initiateMobilePayment", () => {
  test("a successful prompt returns the poll url and Paynow's own instructions", async () => {
    const result = await initiateMobilePayment(
      fakeClient({ success: true, pollUrl: "https://paynow.co.zw/poll/1", instructions: "Enter your PIN." }),
      input,
    );
    expect(result).toEqual({
      ok: true,
      pollUrl: "https://paynow.co.zw/poll/1",
      instructions: "Enter your PIN.",
    });
  });

  test("falls back to generic instructions when Paynow sends none", async () => {
    const result = await initiateMobilePayment(
      fakeClient({ success: true, pollUrl: "https://paynow.co.zw/poll/1" }),
      input,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.instructions).toContain("Check your phone");
  });

  test("Paynow declining the request is reported, not thrown", async () => {
    const result = await initiateMobilePayment(fakeClient({ success: false, error: "Invalid phone number" }), input);
    expect(result).toEqual({ ok: false, error: "Invalid phone number" });
  });

  // The SDK swallows a failed HTTP request into `undefined` rather than
  // rejecting — this is the one path a naive `try { await sendMobile() }` misses.
  test("a request the SDK swallowed into undefined is still reported as a failure", async () => {
    const result = await initiateMobilePayment(fakeClient(undefined), input);
    expect(result.ok).toBe(false);
  });

  test("a thrown network error is caught and reported", async () => {
    const result = await initiateMobilePayment(fakeClient(new Error("ECONNREFUSED")), input);
    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });
});

describe("pollPayment", () => {
  test("a paid transaction is reported paid", async () => {
    const result = await pollPayment(fakeClient({ success: false, status: "Paid" }), "https://paynow.co.zw/poll/1");
    expect(result).toEqual({ ok: true, paid: true, status: "paid" });
  });

  test("an awaiting transaction is reported unpaid, not an error", async () => {
    const result = await pollPayment(fakeClient({ success: false, status: "Created" }), "https://paynow.co.zw/poll/1");
    expect(result).toEqual({ ok: true, paid: false, status: "created" });
  });

  test("a cancelled transaction is reported unpaid so the guest can retry", async () => {
    const result = await pollPayment(fakeClient({ success: false, status: "Cancelled" }), "https://paynow.co.zw/poll/1");
    expect(result).toEqual({ ok: true, paid: false, status: "cancelled" });
  });

  test("an error response is reported, not misread as unpaid", async () => {
    const result = await pollPayment(fakeClient({ success: false, error: "Hash mismatch" }), "https://paynow.co.zw/poll/1");
    expect(result).toEqual({ ok: false, error: "Hash mismatch" });
  });

  test("a swallowed request failure is reported", async () => {
    const result = await pollPayment(fakeClient(undefined), "https://paynow.co.zw/poll/1");
    expect(result.ok).toBe(false);
  });
});
