import { describe, expect, test } from "bun:test";

import {
  amountDueNow,
  cancellationFeePercent,
  cancellationQuote,
  dateChangeVerdict,
  paymentPlan,
  seasonOf,
  usd,
} from "./booking-policy";

describe("seasonOf (clauses 2-3)", () => {
  test.each([
    ["2026-06-01", "high"],
    ["2026-10-31", "high"],
    ["2026-12-15", "high"],
    ["2027-01-05", "high"], // in both lists: the strict one wins
    ["2027-01-06", "low"],
    ["2026-05-31", "low"],
    ["2026-11-20", "low"],
    ["2026-12-14", "low"], // in neither list: treated as low
  ])("%s is %s season", (day, season) => {
    expect(seasonOf(day)).toBe(season as "high" | "low");
  });
});

describe("paymentPlan (clause 1)", () => {
  test("a stay more than 14 days out needs a 50% deposit, the balance 14 days before arrival", () => {
    expect(paymentPlan(600, "2026-08-20", "2026-07-01")).toEqual({
      total: 600,
      depositAmount: 300,
      balanceAmount: 300,
      fullPaymentRequired: false,
      balanceDueDate: "2026-08-06",
    });
  });

  test("booked within 14 days of arrival, the full amount is due now", () => {
    expect(paymentPlan(600, "2026-07-15", "2026-07-01")).toMatchObject({
      depositAmount: 600,
      balanceAmount: 0,
      fullPaymentRequired: true,
      balanceDueDate: null,
    });
  });

  test("exactly 15 days out still takes a deposit", () => {
    expect(paymentPlan(600, "2026-07-16", "2026-07-01").fullPaymentRequired).toBe(false);
  });

  test("an odd total rounds the deposit up to whole dollars", () => {
    expect(paymentPlan(245, "2026-09-01", "2026-07-01")).toMatchObject({
      depositAmount: 123,
      balanceAmount: 122,
    });
  });
});

describe("cancellationFeePercent", () => {
  test.each([
    ["low", 31, 10],
    ["low", 30, 50],
    ["low", 15, 50],
    ["low", 14, 75],
    ["low", 7, 75],
    ["low", 6, 100],
    ["low", 0, 100],
    ["high", 46, 25],
    ["high", 45, 75],
    ["high", 30, 75],
    ["high", 29, 100],
  ])("%s season, %i days out: %i%% fee", (season, days, fee) => {
    expect(cancellationFeePercent(season as "low" | "high", days as number)).toBe(fee as number);
  });
});

describe("cancellationQuote", () => {
  const base = { total: 1000, checkIn: "2027-03-20" }; // low season

  test("paid in full, low season, 40 days out: the deposit is kept, the rest back less 5%", () => {
    const quote = cancellationQuote({ ...base, amountPaid: 1000, cancelledOn: "2027-02-08" });
    expect(quote).toMatchObject({ season: "low", daysBeforeArrival: 40, feePercent: 10, retained: 500 });
    // 500 refundable, less 5% = 475.
    expect(quote.refundCents).toBe(47_500);
  });

  test("paid in full, 10 days out: the 75% tier is higher than the deposit, so it applies", () => {
    const quote = cancellationQuote({ ...base, amountPaid: 1000, cancelledOn: "2027-03-10" });
    expect(quote.feePercent).toBe(75);
    expect(quote.retained).toBe(750);
    expect(quote.refundCents).toBe(23_750); // 250 less 5%
  });

  test("only the deposit paid: nothing comes back", () => {
    const quote = cancellationQuote({ ...base, amountPaid: 500, cancelledOn: "2027-01-10" });
    expect(quote.refundCents).toBe(0);
  });

  test("a no-show is a 100% fee whatever the date", () => {
    const quote = cancellationQuote({ ...base, amountPaid: 1000, cancelledOn: "2027-01-01", noShow: true });
    expect(quote.feePercent).toBe(100);
    expect(quote.refundCents).toBe(0);
  });

  test("nothing paid: nothing retained, nothing refunded", () => {
    const quote = cancellationQuote({ ...base, amountPaid: 0, cancelledOn: "2027-01-01" });
    expect(quote.retained).toBe(0);
    expect(quote.refundCents).toBe(0);
  });

  test("a stay paid in full at booking keeps only half as the non-refundable deposit", () => {
    // Booked 12 days out (so paid in full), cancelled the same day: the 75%
    // tier applies, not "everything paid was the deposit".
    const quote = cancellationQuote({ ...base, amountPaid: 1000, cancelledOn: "2027-03-08" });
    expect(quote.nonRefundableDeposit).toBe(500);
    expect(quote.retained).toBe(750);
  });

  test("high season, paid in full, 50 days out: 25% tier, so the deposit (50%) is what is kept", () => {
    const quote = cancellationQuote({
      total: 1000,
      amountPaid: 1000,
      checkIn: "2027-07-20",
      cancelledOn: "2027-05-31",
    });
    expect(quote).toMatchObject({ season: "high", feePercent: 25, retained: 500 });
  });
});

describe("dateChangeVerdict (clause 4, and the end of clause 3)", () => {
  test("low season, more than 21 days out, first change: free", () => {
    expect(
      dateChangeVerdict({ checkIn: "2027-03-30", requestedOn: "2027-03-01", changesUsed: 0 }).kind,
    ).toBe("free");
  });

  test("low season, the free change already used: not free", () => {
    expect(
      dateChangeVerdict({ checkIn: "2027-03-30", requestedOn: "2027-03-01", changesUsed: 1 }).kind,
    ).toBe("not-free");
  });

  test("low season, 21 days out or fewer: not free", () => {
    expect(
      dateChangeVerdict({ checkIn: "2027-03-22", requestedOn: "2027-03-01", changesUsed: 0 }).kind,
    ).toBe("not-free");
  });

  test("high season within 30 days: refused, treated as a cancellation", () => {
    const verdict = dateChangeVerdict({ checkIn: "2027-08-10", requestedOn: "2027-07-20", changesUsed: 0 });
    expect(verdict.kind).toBe("refused");
    expect(verdict.reason).toContain("cancellation");
  });

  test("high season further out: allowed but never free", () => {
    expect(
      dateChangeVerdict({ checkIn: "2027-08-10", requestedOn: "2027-05-01", changesUsed: 0 }).kind,
    ).toBe("not-free");
  });
});

test("usd keeps whole dollars whole and cents to two places", () => {
  expect(usd(1250)).toBe("$1,250");
  expect(usd(237.5)).toBe("$237.50");
});

describe("amountDueNow", () => {
  const booking = { totalAmount: 600, depositAmount: 300 };
  test("nothing paid: the deposit", () => {
    expect(amountDueNow({ ...booking, amountPaid: 0 })).toBe(300);
  });
  test("nothing paid, guest chooses to pay in full: the whole stay", () => {
    expect(amountDueNow({ ...booking, amountPaid: 0 }, true)).toBe(600);
  });
  test("deposit paid: the balance", () => {
    expect(amountDueNow({ ...booking, amountPaid: 300 })).toBe(300);
  });
  test("paid in full: nothing", () => {
    expect(amountDueNow({ ...booking, amountPaid: 600 })).toBe(0);
  });
  test("a booking from before the policy (no deposit on record): the whole stay", () => {
    expect(amountDueNow({ totalAmount: 600, depositAmount: null, amountPaid: 0 })).toBe(600);
  });
});
