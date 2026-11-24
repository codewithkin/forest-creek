import { describe, expect, test } from "bun:test";

import { buildProfitAndLoss, dateMonth, lodgeMonth, monthKeysBetween, monthSpan, NO_EXPENSE_CATEGORY } from "./expense-rules";

describe("months", () => {
  test("monthKeysBetween includes both ends and crosses a new year", () => {
    expect(monthKeysBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthKeysBetween("2026-05", "2026-05")).toEqual(["2026-05"]);
    expect(monthKeysBetween("2026-06", "2026-05")).toEqual([]);
  });

  test("monthSpan runs from the first day to the first day after", () => {
    expect(monthSpan("2026-11", "2026-12")).toEqual({ start: "2026-11-01", end: "2027-01-01" });
  });

  test("a payment late on the last evening (UTC) is the next month in Zimbabwe", () => {
    expect(lodgeMonth(new Date("2026-10-31T21:30:00Z"))).toBe("2026-10");
    expect(lodgeMonth(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11");
    expect(dateMonth(new Date("2026-10-31T00:00:00Z"))).toBe("2026-10");
  });
});

describe("buildProfitAndLoss", () => {
  // Counted by hand: October in $2,000 + $150 invoice; out $100 refund, $430 expenses, $900 wages.
  const pnl = buildProfitAndLoss(["2026-10", "2026-11"], {
    bookings: [
      { month: "2026-10", cents: 150_000 },
      { month: "2026-10", cents: 50_000 },
      { month: "2026-11", cents: 30_000 },
      { month: "2026-09", cents: 99_999 }, // outside: ignored
    ],
    invoices: [{ month: "2026-10", cents: 15_000 }],
    refunds: [{ month: "2026-10", cents: 10_000 }],
    expenses: [
      { month: "2026-10", cents: 30_000, category: "Groceries & kitchen" },
      { month: "2026-10", cents: 13_000, category: null },
      { month: "2026-11", cents: 45_000, category: "Groceries & kitchen" },
    ],
    wages: [{ month: "2026-10", cents: 90_000 }],
  });

  test("each month: money in, money out and profit", () => {
    expect(pnl.months[0]).toMatchObject({
      month: "2026-10",
      label: "October 2026",
      bookings: 200_000,
      invoices: 15_000,
      moneyIn: 215_000,
      refunds: 10_000,
      expenses: 43_000,
      wages: 90_000,
      moneyOut: 143_000,
      profit: 72_000,
    });
    expect(pnl.months[0]!.margin).toBeCloseTo(72_000 / 215_000);
    expect(pnl.months[1]).toMatchObject({ moneyIn: 30_000, moneyOut: 45_000, profit: -15_000 });
  });

  test("totals are the months added up, and a month with no money in has no margin", () => {
    expect(pnl.total).toMatchObject({ moneyIn: 245_000, moneyOut: 188_000, profit: 57_000 });
    const empty = buildProfitAndLoss(["2026-01"], { bookings: [], invoices: [], refunds: [], expenses: [{ month: "2026-01", cents: 500 }], wages: [] });
    expect(empty.total).toMatchObject({ moneyIn: 0, profit: -500, margin: null });
  });

  test("expenses by category, biggest first, uncategorised named", () => {
    expect(pnl.expensesByCategory).toEqual([
      { category: "Groceries & kitchen", cents: 75_000, share: 75_000 / 88_000 },
      { category: NO_EXPENSE_CATEGORY, cents: 13_000, share: 13_000 / 88_000 },
    ]);
  });
});
