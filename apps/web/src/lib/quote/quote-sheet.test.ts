import { describe, expect, test } from "bun:test";

import { invoiceSheet, type InvoiceSheetInput } from "@/lib/invoice/invoice-sheet";

import { quoteSheet, type QuoteSheetInput } from "./quote-sheet";

const property = { name: "Misty Ridge Cottages", location: "Bvumba Road, Mutare", phone: "+263 71 234 5679", email: "misty@example.com" };

const quote: QuoteSheetInput = {
  label: "FCQ-2026-000123",
  guestName: "Tariro Moyo",
  company: null,
  validUntil: "2026-11-09",
  issuedAt: "2026-11-02",
  notes: null,
  subtotal: 530,
  discount: 0,
  discountNote: null,
  total: 530,
  lines: [
    { id: "a", kind: "room", description: "Ridge Cottage", checkIn: "2026-12-03", checkOut: "2026-12-06", guests: 2, unitPrice: 160, quantity: 3, amount: 480 },
    { id: "b", kind: "experience", description: "Forest walk", checkIn: null, checkOut: null, guests: null, unitPrice: 25, quantity: 2, amount: 50 },
  ],
  property,
};

describe("quoteSheet", () => {
  test("a room line reads like an invoice item: nights as the quantity, the stay as its details", () => {
    const [room, walk] = quoteSheet(quote).items;
    expect(room).toMatchObject({ title: "Ridge Cottage", qty: "3 nights", price: "$160", amount: "$480" });
    expect(room!.details).toEqual([
      ["Arrival", "3 Dec 2026"],
      ["Departure", "6 Dec 2026"],
      ["Nights", "3"],
      ["Guests", "2"],
    ]);
    expect(walk).toMatchObject({ qty: "2", amount: "$50", details: [["Type", "Experience"]] });
  });

  test("a company is who it is prepared for, with the guest beneath; a discount gets its own line", () => {
    const sheet = quoteSheet({ ...quote, company: "Yambukai Finance", discount: 30, discountNote: "Group rate", total: 500 });
    expect([sheet.party, sheet.partyLine]).toEqual(["Yambukai Finance", "Tariro Moyo"]);
    expect(sheet.adjustments).toEqual([{ label: "Group rate", amount: "-$30" }]);
    expect([sheet.title, sheet.total]).toEqual(["QUOTATION", "$500"]);
  });

  test("staff's note replaces the thank-you, and the dates read in full", () => {
    expect(quoteSheet(quote).note).toBe("Thank you for choosing Misty Ridge Cottages.");
    expect(quoteSheet({ ...quote, notes: "Airport pickup included" }).note).toBe("Airport pickup included");
    expect(quoteSheet(quote).date).toBe("2 November 2026");
    expect(quoteSheet(quote).info[1]?.lines[0]).toBe("9 November 2026");
  });
});

const invoice: InvoiceSheetInput = {
  label: "INV-2026-0006",
  status: "issued",
  billedTo: "Mr Moyo",
  company: null,
  reference: "FC-ABC234",
  issuedOn: "2026-08-18",
  dueOn: null,
  vatRate: 0,
  subtotalCents: 10000,
  vatCents: 0,
  totalCents: 10000,
  paidCents: 0,
  balanceCents: 10000,
  notes: null,
  preparedBy: "Sithembiso Ndlovu",
  lines: [{ id: "l", description: "Executive Room", detail: null, quantity: 1, unitPriceCents: 10000, amountCents: 10000 }],
  property,
};

describe("invoiceSheet", () => {
  test("the paper invoice: billed to, one Executive Room at $100, grand total, prepared by", () => {
    const sheet = invoiceSheet(invoice);
    expect([sheet.title, sheet.number, sheet.partyLabel, sheet.party, sheet.date]).toEqual(["INVOICE", "INV-2026-0006", "Billed to", "Mr Moyo", "18 August 2026"]);
    expect(sheet.items[0]).toMatchObject({ title: "Executive Room", qty: "1", price: "$100", amount: "$100" });
    expect([sheet.totalLabel, sheet.total, sheet.preparedBy]).toEqual(["Grand total (USD)", "$100", "Sithembiso Ndlovu"]);
    expect(sheet.adjustments).toEqual([]);
    expect(sheet.info[1]).toEqual({ label: "Reference", lines: ["FC-ABC234"] });
  });

  test("VAT shows the sub-total and the rate; a part payment shows the balance; paid and void are stamped", () => {
    const sheet = invoiceSheet({ ...invoice, vatRate: 15, subtotalCents: 10000, vatCents: 1500, totalCents: 11500, paidCents: 5000, balanceCents: 6500, dueOn: "2026-09-01" });
    expect(sheet.adjustments).toEqual([
      { label: "Sub-total", amount: "$100" },
      { label: "VAT (15%)", amount: "$15" },
    ]);
    expect(sheet.after).toEqual([
      { label: "Paid", amount: "$50" },
      { label: "Balance due", amount: "$65" },
    ]);
    expect(sheet.info[0]?.lines).toContain("Due by 1 September 2026");
    expect(invoiceSheet({ ...invoice, status: "paid" }).stamp).toBe("PAID");
    expect(invoiceSheet({ ...invoice, status: "void" }).stamp).toBe("VOID");
  });

  test("cents and fractional quantities print cleanly", () => {
    const sheet = invoiceSheet({ ...invoice, lines: [{ id: "x", description: "Conference hall", detail: "Half day", quantity: 1.5, unitPriceCents: 3333, amountCents: 5000 }] });
    expect(sheet.items[0]).toMatchObject({ qty: "1.5", price: "$33.33", amount: "$50", details: [["", "Half day"]] });
  });
});
