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

/** The heading for people in no category. */
export const NO_CATEGORY = "Other staff";

type Summable = { category: string | null; basicCents: number; allowancesCents: number; overtimeCents: number; deductionsCents: number; netCents: number };

export type PayGroup<T extends Summable> = {
  category: string;
  slips: T[];
  basicCents: number;
  allowancesCents: number;
  overtimeCents: number;
  deductionsCents: number;
  netCents: number;
};

/** Payslips grouped by category (A to Z, people in none last), each group with its totals. */
export function groupPayslips<T extends Summable>(slips: T[]): PayGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const slip of slips) {
    const key = slip.category?.trim() || NO_CATEGORY;
    groups.set(key, [...(groups.get(key) ?? []), slip]);
  }
  const sum = (list: T[], field: keyof Summable) => list.reduce((total, slip) => total + (slip[field] as number), 0);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b)))
    .map(([category, list]) => ({
      category,
      slips: list,
      basicCents: sum(list, "basicCents"),
      allowancesCents: sum(list, "allowancesCents"),
      overtimeCents: sum(list, "overtimeCents"),
      deductionsCents: sum(list, "deductionsCents"),
      netCents: sum(list, "netCents"),
    }));
}

/** Where a payslip stands: due, paid, or paid and signed for. */
export function payslipState(slip: { paidAt: Date | string | null; signedAt: Date | string | null }): "due" | "paid" | "signed" {
  if (slip.signedAt) return "signed";
  return slip.paidAt ? "paid" : "due";
}
