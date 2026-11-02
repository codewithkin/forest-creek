import { BRAND_LINE, fromProperty, sheetDay, sheetMoney, type DocumentSheet, type SheetItem } from "@/lib/sheet/document-sheet";

export { sheetDay, sheetMoney } from "@/lib/sheet/document-sheet";

/** What a quotation says, laid out on the shared sheet. Import-free. */

export type QuoteSheetInput = {
  label: string;
  guestName: string;
  company: string | null;
  validUntil: string;
  issuedAt: string;
  notes: string | null;
  subtotal: number;
  discount: number;
  discountNote: string | null;
  total: number;
  lines: {
    id: string;
    kind: string;
    description: string;
    checkIn: string | null;
    checkOut: string | null;
    guests: number | null;
    unitPrice: number;
    quantity: number;
    amount: number;
  }[];
  property: { name: string; location: string; phone: string; email: string };
};

function itemOf(line: QuoteSheetInput["lines"][number]): SheetItem {
  if (line.kind === "room" && line.checkIn && line.checkOut) {
    const nights = line.quantity;
    const details: [string, string][] = [
      ["Arrival", sheetDay(line.checkIn)],
      ["Departure", sheetDay(line.checkOut)],
      ["Nights", String(nights)],
    ];
    if (line.guests) details.push(["Guests", String(line.guests)]);
    return {
      id: line.id,
      title: line.description,
      details,
      qty: `${nights} ${nights === 1 ? "night" : "nights"}`,
      price: sheetMoney(line.unitPrice),
      amount: sheetMoney(line.amount),
    };
  }
  return {
    id: line.id,
    title: line.description,
    details: line.kind === "experience" ? [["Type", "Experience"]] : [],
    qty: String(line.quantity),
    price: sheetMoney(line.unitPrice),
    amount: sheetMoney(line.amount),
  };
}

export function quoteSheet(quote: QuoteSheetInput): DocumentSheet {
  return {
    ...fromProperty(quote.property),
    title: "QUOTATION",
    numberLabel: "Quotation no.",
    number: quote.label,
    partyLabel: "Prepared for",
    party: quote.company ?? quote.guestName,
    partyLine: quote.company ? quote.guestName : null,
    dateLabel: "Date",
    date: sheetDay(quote.issuedAt, "long"),
    items: quote.lines.map(itemOf),
    adjustments: quote.discount > 0 ? [{ label: quote.discountNote || "Discount", amount: `-${sheetMoney(quote.discount)}` }] : [],
    totalLabel: "Total (USD)",
    total: sheetMoney(quote.total),
    after: [],
    info: [
      { label: "Payment", lines: ["EcoCash or card online once you accept. Bank transfer or USD cash also welcome."] },
      { label: "Valid until", lines: [sheetDay(quote.validUntil, "long"), "Open your quotation link and press Accept: the booking is made at these prices."] },
    ],
    note: quote.notes?.trim() || `Thank you for choosing ${quote.property.name}.`,
    preparedBy: null,
    stamp: null,
    footerLine: BRAND_LINE,
  };
}
