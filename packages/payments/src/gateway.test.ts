import { describe, expect, test } from "bun:test";

import {
  initiateMobilePayment,
  initiateWebPayment,
  isMobileMoneyMethod,
  isWebCheckoutMethod,
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
    send: respond,
    sendMobile: respond,
    pollTransaction: respond,
  };
}

const webInput = {
  reference: "FC-ABC123",
  amountUsd: 180,
  guestEmail: "guest@example.com",
  method: "visa" as const,
};

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

describe("method classification", () => {
  test("only EcoCash and OneMoney go down the express mobile money rail", () => {
    expect(isMobileMoneyMethod("ecocash")).toBe(true);
    expect(isMobileMoneyMethod("onemoney")).toBe(true);
    expect(isMobileMoneyMethod("visa")).toBe(false);
    expect(isMobileMoneyMethod("innbucks")).toBe(false);
  });

  test("InnBucks and Visa go through the hosted page", () => {
    expect(isWebCheckoutMethod("innbucks")).toBe(true);
    expect(isWebCheckoutMethod("visa")).toBe(true);
    expect(isWebCheckoutMethod("ecocash")).toBe(false);
  });

  test("an unknown method belongs to neither rail", () => {
    expect(isMobileMoneyMethod("bitcoin")).toBe(false);
    expect(isWebCheckoutMethod("bitcoin")).toBe(false);
  });
});

describe("initiateWebPayment", () => {
  test("a successful checkout returns the page to send the guest to", async () => {
    const result = await initiateWebPayment(
      fakeClient({
        success: true,
        pollUrl: "https://paynow.co.zw/poll/1",
        redirectUrl: "https://paynow.co.zw/pay/abc",
      }),
      webInput,
    );
    expect(result).toEqual({
      ok: true,
      pollUrl: "https://paynow.co.zw/poll/1",
      redirectUrl: "https://paynow.co.zw/pay/abc",
      instructions: "Open the link to pay by Visa or Mastercard, then come back to this page.",
      innbucks: undefined,
    });
  });

  test("Paynow's own instructions win over the fallback wording", async () => {
    const result = await initiateWebPayment(
      fakeClient({
        success: true,
        pollUrl: "https://paynow.co.zw/poll/1",
        redirectUrl: "https://paynow.co.zw/pay/abc",
        instructions: "Complete the payment on the next page.",
      }),
      webInput,
    );
    expect(result.ok && result.instructions).toBe("Complete the payment on the next page.");
  });

  test("an InnBucks authorisation is passed through for the deep link and QR", async () => {
    const result = await initiateWebPayment(
      fakeClient({
        success: true,
        pollUrl: "https://paynow.co.zw/poll/1",
        redirectUrl: "https://paynow.co.zw/pay/abc",
        innbucks_info: [
          {
            authorizationcode: "123456",
            deep_link_url: "schinn.wbpycode://innbucks.co.zw?pymInnCode=123456",
            qr_code: "https://example.test/qr",
          },
        ],
      }),
      { ...webInput, method: "innbucks" },
    );
    expect(result.ok && result.innbucks?.authorizationcode).toBe("123456");
  });

  // A poll url with nowhere to send the guest is not a usable checkout: they
  // would sit on a page that says "paying" with nothing ever charged.
  test("a response with no payment page is a failure, not a success", async () => {
    const result = await initiateWebPayment(
      fakeClient({ success: true, pollUrl: "https://paynow.co.zw/poll/1" }),
      webInput,
    );
    expect(result.ok).toBe(false);
  });

  test("a declined request reports Paynow's reason", async () => {
    const result = await initiateWebPayment(
      fakeClient({ success: false, error: "Invalid integration id" }),
      webInput,
    );
    expect(result).toEqual({ ok: false, error: "Invalid integration id" });
  });

  test("a request the SDK swallowed into undefined is still reported as a failure", async () => {
    const result = await initiateWebPayment(fakeClient(undefined), webInput);
    expect(result.ok).toBe(false);
  });

  test("a thrown network error is caught and reported", async () => {
    const result = await initiateWebPayment(fakeClient(new Error("ECONNREFUSED")), webInput);
    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });
});
