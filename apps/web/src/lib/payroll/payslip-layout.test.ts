import { describe, expect, test } from "bun:test";

import { payslipLayout, type PayslipForLayout } from "./payslip-layout";

const slip: PayslipForLayout = {
  id: "p1",
  runLabel: "PR-2026-11-0004",
  employeeName: "Chipo Moyo",
  position: "Housekeeper",
  basicCents: 30000,
  allowancesCents: 2000,
  overtimeCents: 0,
  deductionsCents: 5000,
  deductionNote: "Advance",
  netCents: 27000,
  method: "ecocash",
  paidAt: "2026-11-28T10:00:00.000Z",
  paidBy: "owner@example.com",
  reference: "MP123",
  signature: null,
  signedAt: null,
  payRun: { period: "2026-11", property: null },
  employee: { idNumber: "63-1234567A42", paymentDetails: "0771234567", property: null },
};

describe("payslipLayout", () => {
  test("earnings, gross, deductions and net, with how it was paid", () => {
    const layout = payslipLayout(slip);
    expect(layout.period).toBe("November 2026");
    expect(layout.earnings).toEqual([
      ["Basic pay", "$300"],
      ["Allowances", "$20"],
    ]);
    expect([layout.gross, layout.deductions, layout.net]).toEqual(["$320", [["Advance", "-$50"]], "$270"]);
    expect(layout.paid).toBe("Paid 28 November 2026 by EcoCash, ref MP123");
    expect(layout.employee).toContainEqual(["Paid to", "EcoCash · 0771234567"]);
  });

  test("a group-wide run is on the lodge's own letterhead; an unpaid slip says so", () => {
    const layout = payslipLayout({ ...slip, paidAt: null, reference: null });
    expect(layout.from.contacts).toEqual(["+263 71 995 6882"]);
    expect(layout.paid).toBe("Not paid yet");
  });
});
