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
  from: SheetFrom;
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
};

/**
 * Who a document is from, as the letterhead's footer prints it: the place and
 * the reservations address on the first line, phone numbers (or the signing
 * official's own email and phones) on the second.
 */
export type SheetFrom = { name: string; address: string; email: string; contacts: string[] };

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

/** A property as the letterhead's sender; `contacts` replaces its phone with an official's own. */
export function fromProperty(property: { name: string; location: string; phone: string; email?: string }, contacts?: string[]): SheetFrom {
  return { name: property.name, address: property.location, email: property.email ?? "", contacts: contacts ?? [property.phone] };
}

/** The footer's two lines. The group's own name is in the band above, so only another property is named. */
export function footerLines(from: SheetFrom): { place: string; email: string; contacts: string[] } {
  const place = from.name && from.name !== "Forest Creek" ? `${from.name} · ${from.address}` : from.address;
  return { place, email: from.email, contacts: from.contacts.filter(Boolean) };
}
