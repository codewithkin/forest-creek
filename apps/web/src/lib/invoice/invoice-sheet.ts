import { BRAND_LINE, fromProperty, sheetDay, sheetMoney, type DocumentSheet } from "@/lib/sheet/document-sheet";

/**
 * An invoice on the shared sheet: the lodge's paper invoice book (To, Date,
 * REF No., Qty, Item, Unit, Total, Sub-total, VAT, Grand total, Prepared by)
 * in the quotation's layout. Import-free.
 */

export type InvoiceSheetInput = {
  label: string;
  status: string;
  billedTo: string;
  company: string | null;
  reference: string | null;
  issuedOn: string;
  dueOn: string | null;
  vatRate: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  notes: string | null;
  preparedBy: string;
  lines: { id: string; description: string; detail: string | null; quantity: number; unitPriceCents: number; amountCents: number }[];
  property: { name: string; location: string; phone: string; email: string };
};

const dollars = (cents: number) => sheetMoney(cents / 100);
const quantity = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, ""));

export function invoiceSheet(invoice: InvoiceSheetInput): DocumentSheet {
  const vat = invoice.vatRate > 0;
  return {
    ...fromProperty(invoice.property),
    title: "INVOICE",
    numberLabel: "Invoice no.",
    number: invoice.label,
    partyLabel: "Billed to",
    party: invoice.company ?? invoice.billedTo,
    partyLine: invoice.company ? invoice.billedTo : null,
    dateLabel: "Date",
    date: sheetDay(invoice.issuedOn, "long"),
    items: invoice.lines.map((line) => ({
      id: line.id,
      title: line.description,
      details: line.detail ? [["", line.detail]] : [],
      qty: quantity(line.quantity),
      price: dollars(line.unitPriceCents),
      amount: dollars(line.amountCents),
    })),
    adjustments: vat
      ? [
          { label: "Sub-total", amount: dollars(invoice.subtotalCents) },
          { label: `VAT (${invoice.vatRate}%)`, amount: dollars(invoice.vatCents) },
        ]
      : [],
    totalLabel: "Grand total (USD)",
    total: dollars(invoice.totalCents),
    after:
      invoice.paidCents > 0 && invoice.status !== "void"
        ? [
            { label: "Paid", amount: dollars(invoice.paidCents) },
            { label: "Balance due", amount: dollars(invoice.balanceCents) },
          ]
        : [],
    info: [
      { label: "Payment", lines: ["EcoCash, card, bank transfer or USD cash.", ...(invoice.dueOn && invoice.balanceCents > 0 ? [`Due by ${sheetDay(invoice.dueOn, "long")}`] : [])] },
      { label: "Reference", lines: [invoice.reference || "—"] },
    ],
    note: invoice.notes?.trim() || `Thank you for choosing ${invoice.property.name}.`,
    preparedBy: invoice.preparedBy,
    stamp: invoice.status === "void" ? "VOID" : invoice.status === "paid" ? "PAID" : null,
    footerLine: BRAND_LINE,
  };
}
