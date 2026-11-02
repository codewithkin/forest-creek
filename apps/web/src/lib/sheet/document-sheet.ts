/**
 * The lodge's documents as one sheet: who it is from, the title and its
 * number, who it is for and the date, one table of items, the totals, two
 * short blocks (payment, validity or reference), a note, who prepared it, and
 * a footer line. Quotations and invoices fill it in (quote-sheet.ts,
 * invoice-sheet.ts); the PDF (sheet-pdf.tsx) and the screen (DocumentSheetView)
 * both draw it, so the two never disagree. Import-free.
 */

export type SheetItem = {
  id: string;
  title: string;
  /** Label / value pairs under the title: a stay's dates, nights and guests. */
  details: [string, string][];
  qty: string;
  price: string;
  amount: string;
};

export type SheetRow = { label: string; amount: string };

export type DocumentSheet = {
  title: string;
  numberLabel: string;
  number: string;
  from: { lines: string[]; phone: string; email?: string };
  partyLabel: string;
  party: string;
  partyLine: string | null;
  dateLabel: string;
  date: string;
  items: SheetItem[];
  /** Between the items and the total: sub-total, discount, VAT. */
  adjustments: SheetRow[];
  totalLabel: string;
  total: string;
  /** After the total: paid, balance due. */
  after: SheetRow[];
  info: { label: string; lines: string[] }[];
  note: string;
  /** "Prepared by", like the paper book's signature line. */
  preparedBy: string | null;
  /** A word across the sheet: PAID, VOID. */
  stamp: string | null;
  footerLine: string;
  footerName: string;
};

export const BRAND_LINE = "Where Nature Meets Luxury";

export function sheetMoney(amount: number): string {
  const negative = amount < 0;
  const figure = Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 });
  return `${negative ? "-" : ""}$${figure}`;
}

/** Stay dates are UTC midnights: formatted in UTC or they shift a day. */
export function sheetDay(value: string, month: "short" | "long" = "short"): string {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month,
    year: "numeric",
  });
}

/** The address lines and footer name, from a property's location. */
export function fromProperty(property: { name: string; location: string; phone: string; email?: string }) {
  return {
    from: { lines: property.location.split(/,\s*/).filter(Boolean).slice(0, 2), phone: property.phone, email: property.email },
    footerName: [property.name, property.location.split(/,\s*/)[0]].filter(Boolean).join(" · "),
  };
}
