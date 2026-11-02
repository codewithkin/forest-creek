import { describe, expect, test } from "bun:test";

import { quoteSheet, type QuoteSheetInput } from "./quote-sheet";

const base: QuoteSheetInput = {
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
  property: { name: "Misty Ridge Cottages", location: "Bvumba Road, Mutare", phone: "+263 71 234 5679", email: "misty@example.com" },
};

describe("quoteSheet", () => {
  test("a room line reads like an invoice item: nights as the quantity, the stay as its details", () => {
    const [room, walk] = quoteSheet(base).items;
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
    const sheet = quoteSheet({ ...base, company: "Yambukai Finance", discount: 30, discountNote: "Group rate", total: 500 });
    expect([sheet.billedTo, sheet.billedToLine]).toEqual(["Yambukai Finance", "Tariro Moyo"]);
    expect(sheet.discount).toEqual({ label: "Group rate", amount: "-$30" });
    expect(sheet.total).toBe("$500");
  });

  test("staff's note replaces the thank-you, and the dates read in full", () => {
    expect(quoteSheet(base).note).toBe("Thank you for choosing Misty Ridge Cottages.");
    expect(quoteSheet({ ...base, notes: "Airport pickup included" }).note).toBe("Airport pickup included");
    expect([quoteSheet(base).date, quoteSheet(base).validUntil]).toEqual(["2 November 2026", "9 November 2026"]);
  });
});
