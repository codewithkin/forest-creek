import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { addDays, createRoom, createStaffBooking, deleteBookingRecord, deleteReceiptRecord, lodgeToday, prisma, recordManualPayment } from "./index";

/** The owner's single deletes, against the dev database on a throwaway property. */
const SLUG = "owner-deletes-test";
const BY = "owner-deletes@example.com";
let roomId: string;
let n = 0;

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { property: { slug: SLUG } } } });
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: { slug: SLUG, name: SLUG, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  roomId = (await createRoom({ propertyId: property.id, name: "Room", description: "-", pricePerNight: 100, capacity: 2, bedType: "-", images: ["/media/x.jpg"] })).id;
});
afterAll(cleanup);

const stay = (payment: Parameters<typeof createStaffBooking>[0]["payment"]) => {
  n += 1;
  const today = lodgeToday();
  return createStaffBooking({ roomId, checkIn: addDays(today, 40 + n * 3), checkOut: addDays(today, 42 + n * 3), guests: 1, guestName: "Del", source: "phone", payment }, BY);
};

describe("deleting one booking", () => {
  test("it goes with its receipts and history; nothing else is touched", async () => {
    const keep = await stay({ kind: "none" });
    const gone = await stay({ kind: "record", amount: 50, method: "cash", note: "R1" });
    expect(await prisma.receipt.count({ where: { bookingId: gone.id } })).toBe(1);
    expect(await deleteBookingRecord(gone.id)).toEqual({ reference: gone.reference });
    expect(await prisma.booking.count({ where: { id: gone.id } })).toBe(0);
    expect(await prisma.receipt.count({ where: { bookingId: gone.id } })).toBe(0);
    expect(await prisma.bookingEvent.count({ where: { bookingId: gone.id } })).toBe(0);
    expect(await prisma.booking.count({ where: { id: keep.id } })).toBe(1);
  });
});

describe("deleting one receipt", () => {
  test("takes its amount off what was paid; the last one makes the stay unpaid again", async () => {
    const booking = await stay({ kind: "record", amount: 50, method: "cash", note: "R1" });
    await recordManualPayment({ id: booking.id, amount: 150, method: "bank_transfer", note: "CBZ" }, BY);
    const [first, second] = await prisma.receipt.findMany({ where: { bookingId: booking.id }, orderBy: { issuedAt: "asc" } });

    await deleteReceiptRecord(second!.id, BY);
    let after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect([after.amountPaid, after.paymentStatus, after.bookingStatus]).toEqual([50, "partial", "confirmed"]);

    await deleteReceiptRecord(first!.id, BY);
    after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect([after.amountPaid, after.paymentStatus, after.bookingStatus]).toEqual([0, "pending", "pending"]);
  });
});
