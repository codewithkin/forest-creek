/**
 * What a quotation says, laid out once for both the PDF and the on-screen
 * preview, so the two can never disagree. Import-free: the dashboard's client
 * bundle and the PDF route both read it.
 *
 * The structure is a plain invoice sheet: who it is from, QUOTATION and its
 * number, who it is for and the date, one table of items, the total, how to
 * pay and accept, a thank-you, and a footer line.
 */

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

export type SheetItem = {
  id: string;
  title: string;
  /** Label / value pairs under the title, like a vehicle's details on an invoice. */
  details: [string, string][];
  qty: string;
  price: string;
  amount: string;
};

export type QuoteSheet = {
  from: { name: string; lines: string[]; phone: string };
  number: string;
  billedTo: string;
  billedToLine: string | null;
  date: string;
  validUntil: string;
  items: SheetItem[];
  discount: { label: string; amount: string } | null;
  total: string;
  payment: string;
  accept: string;
  note: string;
  footerLine: string;
  footerName: string;
};

export function sheetMoney(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
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

export function quoteSheet(quote: QuoteSheetInput, brandLine = "Where Nature Meets Luxury"): QuoteSheet {
  const { property } = quote;
  return {
    from: { name: property.name, lines: property.location.split(/,\s*/).filter(Boolean).slice(0, 2), phone: property.phone },
    number: quote.label,
    billedTo: quote.company ?? quote.guestName,
    billedToLine: quote.company ? quote.guestName : null,
    date: sheetDay(quote.issuedAt, "long"),
    validUntil: sheetDay(quote.validUntil, "long"),
    items: quote.lines.map(itemOf),
    discount: quote.discount > 0 ? { label: quote.discountNote || "Discount", amount: `-${sheetMoney(quote.discount)}` } : null,
    total: sheetMoney(quote.total),
    payment: "EcoCash or card online once you accept. Bank transfer or USD cash also welcome.",
    accept: "Open your quotation link and press Accept: the booking is made at these prices.",
    note: quote.notes?.trim() || `Thank you for choosing ${property.name}.`,
    footerLine: brandLine,
    footerName: [property.name, property.location.split(/,\s*/)[0]].filter(Boolean).join(" · "),
  };
}
