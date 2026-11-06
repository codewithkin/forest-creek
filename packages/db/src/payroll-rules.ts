// Import-free so it can be unit tested without a database or env.

export const payMethods = ["cash", "bank_transfer", "ecocash"] as const;
export type PayMethod = (typeof payMethods)[number];

/** Net pay: basic plus allowances and overtime, less deductions. Never below zero. */
export function netPayCents(slip: { basicCents: number; allowancesCents?: number; overtimeCents?: number; deductionsCents?: number }): number {
  return Math.max(0, slip.basicCents + (slip.allowancesCents ?? 0) + (slip.overtimeCents ?? 0) - (slip.deductionsCents ?? 0));
}

/** "2026-11" → "November 2026". */
export function payPeriodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** PR-2026-11-0004: a run's number, with the month it pays. */
export function payRunNumber(number: number, period: string): string {
  return `PR-${period}-${String(number).padStart(4, "0")}`;
}

/** Where a payslip stands: due, paid, or paid and signed for. */
export function payslipState(slip: { paidAt: Date | string | null; signedAt: Date | string | null }): "due" | "paid" | "signed" {
  if (slip.signedAt) return "signed";
  return slip.paidAt ? "paid" : "due";
}
