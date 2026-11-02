import { describe, expect, test } from "bun:test";

import { isOpen, quoteNumber, quoteTotals, spreadDiscount, whatsappDigits } from "./quote-rules";

test("numbers read like receipts", () => {
  expect(quoteNumber(123, new Date("2026-11-02T10:00:00Z"))).toBe("FCQ-2026-000123");
});

test("totals are the lines less the discount", () => {
  expect(quoteTotals([{ amount: 300 }, { amount: 120 }], 20)).toEqual({ subtotal: 420, total: 400 });
});

test("only sent and viewed quotes are open", () => {
  expect(["draft", "sent", "viewed", "accepted", "declined", "expired", "cancelled"].filter(isOpen)).toEqual(["sent", "viewed"]);
});

describe("spreadDiscount", () => {
  test("comes off the first booking when it fits", () => {
    expect(spreadDiscount([300, 200], 50)).toEqual([50, 0]);
  });

  test("carries on to the next rather than going negative", () => {
    expect(spreadDiscount([100, 200], 150)).toEqual([100, 50]);
  });
});

describe("whatsappDigits", () => {
  test("local, international and 00 numbers all reach the same chat", () => {
    for (const number of ["0771 234 567", "+263 77 123 4567", "263771234567", "00263771234567"]) {
      expect(whatsappDigits(number)).toBe("263771234567");
    }
  });

  test("a number too short to be a phone is refused", () => {
    expect(whatsappDigits("12345")).toBeUndefined();
    expect(whatsappDigits("")).toBeUndefined();
  });
});
