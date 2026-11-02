import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  createInvoice,
  createRoom,
  createStaffBooking,
  getInvoice,
  getInvoiceStats,
  invoiceBalanceCents,
  invoiceDraftFromBooking,
  invoiceNumber,
  invoiceTotals,
  lineAmountCents,
  listInvoices,
  lodgeToday,
  prisma,
  queueInvoiceEmail,
  setInvoicesPaid,
  toCents,
  voidInvoices,
  type InvoiceInput,
} from "./index";

describe("invoice arithmetic", () => {
  test("numbers like the paper book, with the year", () => {
    expect(invoiceNumber(6, new Date("2026-08-18T10:00:00Z"))).toBe("INV-2026-0006");
  });

  test("cents without float dust; VAT once on the sub-total", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(lineAmountCents(1.5, 3333)).toBe(5000);
    expect(invoiceTotals([{ amountCents: 10000 }, { amountCents: 333 }], 15.5)).toEqual({ subtotalCents: 10333, vatCents: 1602, totalCents: 11935 });
    expect(invoiceTotals([{ amountCents: 10000 }], 0)).toEqual({ subtotalCents: 10000, vatCents: 0, totalCents: 10000 });
  });

  test("a balance is never negative, and a void invoice owes nothing", () => {
    expect(invoiceBalanceCents({ status: "issued", totalCents: 10000, paidCents: 4000 })).toBe(6000);
    expect(invoiceBalanceCents({ status: "issued", totalCents: 10000, paidCents: 12000 })).toBe(0);
    expect(invoiceBalanceCents({ status: "void", totalCents: 10000, paidCents: 0 })).toBe(0);
  });
});

/** Against the dev database, on a throwaway property. */
const SLUG = "invoices-test";
const BY = { email: "invoices-test@example.com", name: "Sithembiso Ndlovu" };
let propertyId: string;
let roomId: string;

async function cleanup() {
  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: "invoice:" }, recipient: "mr-moyo@example.com" } });
  await prisma.invoice.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: { slug: SLUG, name: "Invoice House", tagline: "-", description: "-", location: "261 Rhine Farm, Lower Vumba", phone: "+263 1", email: "inv@example.com", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  propertyId = property.id;
  roomId = (await createRoom({ propertyId, name: "Executive Room", description: "-", pricePerNight: 100, capacity: 2, bedType: "-", images: ["/media/x.jpg"] })).id;
});
afterAll(cleanup);

const paper = (extra: Partial<InvoiceInput> = {}): InvoiceInput => ({
  propertyId,
  billedTo: "Mr Moyo",
  email: "mr-moyo@example.com",
  issuedOn: "2026-08-18",
  lines: [{ description: "Executive Room", quantity: 1, unitPrice: 100 }],
  ...extra,
});

describe("invoices", () => {
  test("the paper invoice, digitised: one Executive Room, $100, prepared by whoever issued it", async () => {
    const invoice = await createInvoice(paper(), BY);
    const view = await getInvoice(invoice.id);
    expect(view).toMatchObject({ billedTo: "Mr Moyo", subtotalCents: 10000, vatCents: 0, totalCents: 10000, balanceCents: 10000, status: "issued", preparedBy: "Sithembiso Ndlovu" });
    expect(view?.label).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  test("VAT, a discount line and money already received", async () => {
    const invoice = await createInvoice(
      paper({ vatRate: 15, paid: 50, lines: [{ description: "Room", quantity: 2, unitPrice: 100 }, { description: "Returning guest", quantity: 1, unitPrice: -20 }] }),
      BY,
    );
    expect([invoice.subtotalCents, invoice.vatCents, invoice.totalCents, invoice.paidCents]).toEqual([18000, 2700, 20700, 5000]);
  });

  test("paid in full on creation is marked paid; a negative total is refused", async () => {
    expect((await createInvoice(paper({ paid: 100 }), BY)).status).toBe("paid");
    expect(createInvoice(paper({ lines: [{ description: "Refund", quantity: 1, unitPrice: -10 }] }), BY)).rejects.toThrow("below zero");
  });

  test("marked paid, back to unpaid, and voided; a void one owes nothing and stays", async () => {
    const one = await createInvoice(paper(), BY);
    const two = await createInvoice(paper(), BY);
    expect(await setInvoicesPaid([one.id, two.id], true)).toEqual({ changed: 2 });
    expect((await getInvoice(one.id))?.balanceCents).toBe(0);
    expect(await setInvoicesPaid([one.id], false)).toEqual({ changed: 1 });
    expect(await voidInvoices([two.id])).toEqual({ changed: 1 });
    expect((await getInvoice(two.id))?.status).toBe("void");
    expect(await setInvoicesPaid([two.id], true)).toEqual({ changed: 0 });
  });

  test("lists by name, company, reference or number, in scope; stats count what is owed", async () => {
    const special = await createInvoice(paper({ billedTo: "Yambukai Finance", reference: "PO-778" }), BY);
    const label = (await getInvoice(special.id))!.label;
    expect((await listInvoices({ search: "yambukai" }, [propertyId])).map((row) => row.id)).toEqual([special.id]);
    expect((await listInvoices({ search: "PO-778" }, [propertyId])).map((row) => row.id)).toEqual([special.id]);
    expect((await listInvoices({ search: label }, [propertyId])).map((row) => row.id)).toEqual([special.id]);
    expect(await listInvoices({}, ["no-such-property"])).toEqual([]);
    const stats = await getInvoiceStats([propertyId]);
    expect(stats.outstandingCents).toBeGreaterThanOrEqual(10000);
  });

  test("an email goes through the outbox, a new one per send", async () => {
    const invoice = await createInvoice(paper(), BY);
    expect(await queueInvoiceEmail(invoice.id)).toEqual({ queued: true });
    expect(await queueInvoiceEmail(invoice.id)).toEqual({ queued: true });
    const rows = await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `invoice:${invoice.id}:` } } });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.body).toContain(`/invoice/${invoice.id}/pdf`);
    const none = await createInvoice(paper({ email: "" }), BY);
    expect((await queueInvoiceEmail(none.id)).queued).toBe(false);
  });

  test("starts from a booking: the room for its nights, the reference, what's been paid", async () => {
    const today = lodgeToday();
    const booking = await createStaffBooking(
      { roomId, checkIn: addDays(today, 10), checkOut: addDays(today, 13), guests: 2, guestName: "Mr Moyo", guestEmail: "mr-moyo@example.com", source: "phone", payment: { kind: "record", amount: 100, method: "cash", note: "R-1" } },
      BY.email,
    );
    const draft = await invoiceDraftFromBooking(booking.id);
    expect(draft).toMatchObject({ billedTo: "Mr Moyo", reference: booking.reference, paid: 100, lines: [{ description: "Executive Room", quantity: 3, unitPrice: 100 }] });
    const invoice = await createInvoice({ ...draft, issuedOn: today }, BY);
    expect([invoice.totalCents, invoice.paidCents, invoice.bookingId]).toEqual([30000, 10000, booking.id]);
  });
});
