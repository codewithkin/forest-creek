import { lodge } from "@/lib/lodge";
import { fromProperty, sheetDay, sheetMoney } from "@/lib/sheet/document-sheet";

/**
 * A payslip on the letterhead: who, the month, earnings and deductions, net
 * pay, how and when it was paid, and the employee's signature on receipt.
 * Import-free (lodge.ts is plain data).
 */

type PropertyFacts = { name: string; location: string; phone: string; email: string };

export type PayslipForLayout = {
  id: string;
  runLabel: string;
  employeeName: string;
  position: string | null;
  basicCents: number;
  allowancesCents: number;
  overtimeCents: number;
  deductionsCents: number;
  deductionNote: string | null;
  netCents: number;
  method: string;
  paidAt: Date | string | null;
  paidBy: string | null;
  reference: string | null;
  signature: string | null;
  signedAt: Date | string | null;
  payRun: { period: string; property: PropertyFacts | null };
  employee: { idNumber: string | null; paymentDetails: string | null; property: PropertyFacts | null };
};

const METHODS: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer", ecocash: "EcoCash" };
const PAID_BY: Record<string, string> = { cash: "cash", bank_transfer: "bank transfer", ecocash: "EcoCash" };
const dollars = (cents: number) => sheetMoney(cents / 100);
const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());

export function payslipLayout(slip: PayslipForLayout) {
  const property = slip.payRun.property ?? slip.employee.property ?? { name: lodge.name, location: lodge.address, phone: lodge.phone, email: lodge.email };
  const [year, month] = slip.payRun.period.split("-").map(Number);
  const period = new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
  const earnings: [string, string][] = [["Basic pay", dollars(slip.basicCents)]];
  if (slip.allowancesCents) earnings.push(["Allowances", dollars(slip.allowancesCents)]);
  if (slip.overtimeCents) earnings.push(["Overtime", dollars(slip.overtimeCents)]);
  const gross = slip.basicCents + slip.allowancesCents + slip.overtimeCents;
  return {
    from: fromProperty(property),
    number: slip.runLabel,
    period,
    employee: [
      ["Name", slip.employeeName],
      ["Position", slip.position || "—"],
      ["ID no.", slip.employee.idNumber || "—"],
      ["Paid to", [METHODS[slip.method] ?? slip.method, slip.employee.paymentDetails].filter(Boolean).join(" · ")],
    ] as [string, string][],
    earnings,
    gross: dollars(gross),
    deductions: slip.deductionsCents ? ([[slip.deductionNote || "Deductions", `-${dollars(slip.deductionsCents)}`]] as [string, string][]) : [],
    net: dollars(slip.netCents),
    paid: slip.paidAt ? `Paid ${sheetDay(iso(slip.paidAt), "long")} by ${PAID_BY[slip.method] ?? slip.method}${slip.reference ? `, ref ${slip.reference}` : ""}` : "Not paid yet",
    signature: slip.signature,
    signedOn: slip.signedAt ? sheetDay(iso(slip.signedAt), "long") : null,
    paidBy: slip.paidBy,
  };
}

export type PayslipLayout = ReturnType<typeof payslipLayout>;
