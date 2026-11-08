import { describe, expect, test } from "bun:test";

import { payRunSpreadsheet, payRunSummary, type PayRunForSummary } from "./pay-run-summary";

const slip = (id: string, name: string, category: string | null, net: number, paidAt: string | null = null) => ({
  id,
  employeeName: name,
  position: null,
  category,
  basicCents: net,
  allowancesCents: 0,
  overtimeCents: 0,
  deductionsCents: 0,
  netCents: net,
  method: "cash",
  paidAt,
  signedAt: null,
});

const run: PayRunForSummary = {
  label: "PR-2026-06-0012",
  period: "2026-06",
  createdBy: "owner@example.com",
  property: null,
  payslips: [slip("a", "Chipo", "Housekeeping", 30000, "2026-06-28T10:00:00.000Z"), slip("b", "Tendai", "Guards", 25050)],
  groups: [
    { category: "Guards", ids: ["b"], basicCents: 25050, allowancesCents: 0, overtimeCents: 0, deductionsCents: 0, netCents: 25050 },
    { category: "Housekeeping", ids: ["a"], basicCents: 30000, allowancesCents: 0, overtimeCents: 0, deductionsCents: 0, netCents: 30000 },
  ],
};

describe("pay run summary", () => {
  test("each category with its people and subtotal, then the total, on the lodge's letterhead", () => {
    const summary = payRunSummary(run);
    expect(summary.period).toBe("June 2026");
    expect(summary.groups.map((group) => [group.category, group.rows.map((row) => row.name), group.subtotal.net])).toEqual([
      ["Guards", ["Tendai"], "$250.50"],
      ["Housekeeping", ["Chipo"], "$300"],
    ]);
    expect([summary.total.net, summary.total.position, summary.paidCount]).toEqual(["$550.50", "2 people", 1]);
    expect(summary.groups[1]!.rows[0]!.status).toBe("Paid 28 Jun");
    expect(summary.from.contacts).toEqual(["+263 71 995 6882"]);
  });

  test("the spreadsheet has a header, a line per person with their category, subtotals and a total, in dollars", () => {
    const rows = payRunSpreadsheet(run);
    expect(rows[0]![0]).toBe("Category");
    expect(rows.map((row) => [row[0], row[1], row[7]])).toEqual([
      ["Category", "Name", "Net pay"],
      ["Guards", "Tendai", 250.5],
      ["Guards total", "", 250.5],
      ["Housekeeping", "Chipo", 300],
      ["Housekeeping total", "", 300],
      ["Total", "", 550.5],
    ]);
  });
});
