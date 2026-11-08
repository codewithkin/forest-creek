import { lodge } from "@/lib/lodge";
import { fromProperty, sheetDay, sheetMoney, type SheetFrom } from "@/lib/sheet/document-sheet";

/**
 * A month's pay run as one summary for the owner to pass on: each category
 * (housekeeping, guards...) with its people and subtotal, then the total.
 * The PDF (pay-run-pdf.tsx) and the spreadsheet download both read this.
 * Import-free (lodge.ts is plain data).
 */

type PropertyFacts = { name: string; location: string; phone: string; email: string };

export type PayRunForSummary = {
  label: string;
  period: string;
  createdBy: string;
  property: PropertyFacts | null;
  payslips: {
    id: string;
    employeeName: string;
    position: string | null;
    category: string | null;
    basicCents: number;
    allowancesCents: number;
    overtimeCents: number;
    deductionsCents: number;
    netCents: number;
    method: string;
    paidAt: Date | string | null;
    signedAt: Date | string | null;
  }[];
  groups: { category: string; ids: string[]; basicCents: number; allowancesCents: number; overtimeCents: number; deductionsCents: number; netCents: number }[];
};

const METHOD: Record<string, string> = { cash: "Cash", bank_transfer: "Bank", ecocash: "EcoCash" };
const dollars = (cents: number) => sheetMoney(cents / 100);
const iso = (value: Date | string) => (typeof value === "string" ? value : value.toISOString());

export type SummaryRow = { name: string; position: string; basic: string; extras: string; deductions: string; net: string; method: string; status: string };

export type PayRunSummary = {
  from: SheetFrom;
  number: string;
  period: string;
  people: number;
  groups: { category: string; rows: SummaryRow[]; subtotal: SummaryRow }[];
  total: SummaryRow;
  paidCount: number;
  signedCount: number;
  preparedBy: string;
};

export function periodName(period: string): string {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "Signed 28 Jun": the run's month already gives the year. */
const dayMonth = (value: Date | string) => sheetDay(iso(value)).replace(/ \d{4}$/, "");

function status(slip: PayRunForSummary["payslips"][number]): string {
  if (slip.signedAt) return `Signed ${dayMonth(slip.signedAt)}`;
  return slip.paidAt ? `Paid ${dayMonth(slip.paidAt)}` : "Due";
}

function totalsRow(label: string, group: { basicCents: number; allowancesCents: number; overtimeCents: number; deductionsCents: number; netCents: number }, people: number): SummaryRow {
  return {
    name: label,
    position: `${people} ${people === 1 ? "person" : "people"}`,
    basic: dollars(group.basicCents),
    extras: dollars(group.allowancesCents + group.overtimeCents),
    deductions: group.deductionsCents ? `-${dollars(group.deductionsCents)}` : "—",
    net: dollars(group.netCents),
    method: "",
    status: "",
  };
}

export function payRunSummary(run: PayRunForSummary): PayRunSummary {
  const property = run.property ?? { name: lodge.name, location: lodge.address, phone: lodge.phone, email: lodge.email };
  const byId = new Map(run.payslips.map((slip) => [slip.id, slip]));
  const sum = (field: "basicCents" | "allowancesCents" | "overtimeCents" | "deductionsCents" | "netCents") => run.groups.reduce((total, group) => total + group[field], 0);
  return {
    from: fromProperty(property),
    number: run.label,
    period: periodName(run.period),
    people: run.payslips.length,
    groups: run.groups.map((group) => ({
      category: group.category,
      rows: group.ids.map((id) => {
        const slip = byId.get(id)!;
        return {
          name: slip.employeeName,
          position: slip.position ?? "",
          basic: dollars(slip.basicCents),
          extras: slip.allowancesCents + slip.overtimeCents ? dollars(slip.allowancesCents + slip.overtimeCents) : "—",
          deductions: slip.deductionsCents ? `-${dollars(slip.deductionsCents)}` : "—",
          net: dollars(slip.netCents),
          method: METHOD[slip.method] ?? slip.method,
          status: status(slip),
        };
      }),
      subtotal: totalsRow(`${group.category} total`, group, group.ids.length),
    })),
    total: totalsRow("Total", { basicCents: sum("basicCents"), allowancesCents: sum("allowancesCents"), overtimeCents: sum("overtimeCents"), deductionsCents: sum("deductionsCents"), netCents: sum("netCents") }, run.payslips.length),
    paidCount: run.payslips.filter((slip) => slip.paidAt).length,
    signedCount: run.payslips.filter((slip) => slip.signedAt).length,
    preparedBy: run.createdBy,
  };
}

/** The same run as spreadsheet rows: one line per person with their category, amounts in dollars, then each category's total and the grand total. */
export function payRunSpreadsheet(run: PayRunForSummary): (string | number)[][] {
  const byId = new Map(run.payslips.map((slip) => [slip.id, slip]));
  const money = (cents: number) => Math.round(cents) / 100;
  const rows: (string | number)[][] = [["Category", "Name", "Position", "Basic", "Allowances", "Overtime", "Deductions", "Net pay", "Paid by", "Status"]];
  for (const group of run.groups) {
    for (const id of group.ids) {
      const slip = byId.get(id)!;
      rows.push([group.category, slip.employeeName, slip.position ?? "", money(slip.basicCents), money(slip.allowancesCents), money(slip.overtimeCents), money(slip.deductionsCents), money(slip.netCents), METHOD[slip.method] ?? slip.method, status(slip)]);
    }
    rows.push([`${group.category} total`, "", "", money(group.basicCents), money(group.allowancesCents), money(group.overtimeCents), money(group.deductionsCents), money(group.netCents), "", ""]);
  }
  const sum = (field: "basicCents" | "allowancesCents" | "overtimeCents" | "deductionsCents" | "netCents") => money(run.groups.reduce((total, group) => total + group[field], 0));
  rows.push(["Total", "", "", sum("basicCents"), sum("allowancesCents"), sum("overtimeCents"), sum("deductionsCents"), sum("netCents"), "", ""]);
  return rows;
}
