import { describe, expect, test } from "bun:test";

import { completePaymentLink, paymentPagesFrom } from "./reply-text";

describe("completePaymentLink", () => {
  const page = "https://forestcreek.co.zw/pay/FC-EZTY5J";
  const results = [{ payload: { toolName: "request-payment", result: { ok: false, error: "x", paymentPageUrl: page } } }];

  test("finds the payment pages the tools returned", () => {
    expect(paymentPagesFrom(results)).toEqual([page]);
    expect(paymentPagesFrom(undefined)).toEqual([]);
  });

  test("a reply that ends on 'payment page:' gets the link (seen live)", () => {
    expect(completePaymentLink("Or, you can pay on the booking's payment page:", [page])).toBe(
      `Or, you can pay on the booking's payment page: ${page}`,
    );
  });

  test("a reply that names the payment page without a link gets it on its own line", () => {
    expect(completePaymentLink("You can finish on the payment page.", [page])).toBe(
      `You can finish on the payment page.\n\nYou can pay here: ${page}`,
    );
  });

  test("leaves a reply alone when it already has the link, never mentions paying there, or no tool gave one", () => {
    expect(completePaymentLink(`Pay here: ${page}`, [page])).toBe(`Pay here: ${page}`);
    expect(completePaymentLink("Your stay is confirmed.", [page])).toBe("Your stay is confirmed.");
    expect(completePaymentLink("Pay on the payment page:", [])).toBe("Pay on the payment page:");
  });
});
