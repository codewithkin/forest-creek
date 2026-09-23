import { describe, expect, test } from "bun:test";

import { CANCELLATION_TIERS } from "@forest-creek/db/booking-policy";

import { policyText } from "./policy";

describe("policyText", () => {
  test("states every clause the assistants may quote", () => {
    expect(policyText).toContain("50% non-refundable deposit");
    expect(policyText).toContain("balance is due 14 days before arrival");
    expect(policyText).toContain("paying in full at booking");
    expect(policyText).toContain("less a 5% processing fee");
    expect(policyText).toContain("12-month credit voucher");
    expect(policyText).toContain("/policies");
    // How the non-refundable deposit and the tiers combine — what the system applies.
    expect(policyText).toContain("keeps the higher of the fee and the deposit already paid");
  });

  test("lists each cancellation tier from the same rules the system applies", () => {
    for (const tier of [...CANCELLATION_TIERS.low, ...CANCELLATION_TIERS.high]) {
      expect(policyText).toContain(`${tier.feePercent}% fee`);
    }
    expect(policyText).toContain("Cancelled more than 30 days before arrival: 10% fee, 90% refunded.");
    expect(policyText).toContain("Cancelled 30-45 days before arrival: 75% fee, 25% refunded.");
  });
});
