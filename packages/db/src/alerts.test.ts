import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  applyPaynowStatusUpdate,
  cancelBooking,
  createBooking,
  getBookingPaymentEvents,
  getBookings,
  getOperationalAlerts,
  prisma,
  recordPaynowPaid,
  recordRejectedPaynowCallback,
  STUCK_PAYMENT_MINUTES,
} from "./index";

/**
 * Against the dev database in 2053. Alerts are read for this file's property
 * only where possible, and every row made here is removed afterwards.
 */
const PREFIX = "alerts-test";
let roomId: string;
let propertyId: string;

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { guestEmail: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
  await prisma.paymentEvent.deleteMany({ where: { reference: { startsWith: "FC-ALRT" } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  propertyId = room.propertyId;
  await cleanup();
});
afterAll(cleanup);

let month = 1;
async function book() {
  const m = String(month++).padStart(2, "0");
  return createBooking({
    guestName: "Alert Test",
    guestEmail: `${PREFIX}-${m}@example.com`,
    roomId,
    checkIn: `2053-${m}-10`,
    checkOut: `2053-${m}-12`,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function alertsFor(bookingId: string) {
  const alerts = await getOperationalAlerts([propertyId]);
  return alerts.items.filter((item) => item.bookingId === bookingId).map((item) => item.kind);
}

describe("getOperationalAlerts", () => {
  test("a charge stuck in flight past the threshold is raised, a fresh one is not", async () => {
    const stuck = await book();
    await prisma.booking.update({
      where: { id: stuck.id },
      data: {
        paymentStatus: "processing",
        paymentRequestedAt: minutesAgo(STUCK_PAYMENT_MINUTES + 5),
        holdExpiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const fresh = await book();
    await prisma.booking.update({
      where: { id: fresh.id },
      data: { paymentStatus: "processing", paymentRequestedAt: minutesAgo(2) },
    });

    expect(await alertsFor(stuck.id)).toEqual(["stuck-payment"]);
    expect(await alertsFor(fresh.id)).toEqual([]);
  });

  test("a review note, a refund due and a failed email are each raised", async () => {
    const review = await book();
    await prisma.booking.update({ where: { id: review.id }, data: { reviewNote: "Paid the wrong amount" } });

    const refund = await book();
    await recordPaynowPaid(refund, "paid");
    await cancelBooking(refund.id, "staff@example.com");

    const email = await book();
    await prisma.notification.updateMany({
      where: { bookingId: email.id },
      data: { status: "failed", lastError: "550 mailbox unavailable" },
    });

    expect(await alertsFor(review.id)).toEqual(["review"]);
    expect(await alertsFor(refund.id)).toEqual(["refund-due"]);
    expect(await alertsFor(email.id)).toEqual(["failed-email", "failed-email"]);
  });

  test("the bookings list's attention filter returns the same bookings", async () => {
    const alerts = await getOperationalAlerts([propertyId]);
    const listed = await getBookings({ propertyIds: [propertyId], needsAttention: true, limit: 200 });
    const alerted = new Set(alerts.items.map((item) => item.bookingId));
    for (const id of alerted) expect(listed.some((booking) => booking.id === id)).toBe(true);
  });

  test("a manager's alerts never include forged callbacks; the owner's do", async () => {
    await recordRejectedPaynowCallback("reference=FC-ALRT01&status=Paid&hash=BAD", "hash mismatch");
    const manager = await getOperationalAlerts([propertyId]);
    const owner = await getOperationalAlerts();
    expect(manager.counts.rejectedCallbacks).toBe(0);
    expect(owner.counts.rejectedCallbacks).toBeGreaterThanOrEqual(1);
  });

  test("reports whether Paynow and email are configured", async () => {
    const alerts = await getOperationalAlerts([propertyId]);
    // The test preload removes the Paynow credentials.
    expect(alerts.config.paynow).toBe(false);
    expect(typeof alerts.config.email).toBe("boolean");
  });
});

describe("the payment event log", () => {
  test("records an authentic callback against its booking, with the outcome", async () => {
    const booking = await book();
    const pollUrl = "https://www.paynow.co.zw/Interface/CheckPayment/?guid=alerts-" + booking.reference;
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "processing", paynowPollUrl: pollUrl },
    });

    await applyPaynowStatusUpdate({
      reference: booking.reference,
      amount: "1.00",
      paynowReference: "42",
      pollUrl,
      status: "paid",
    });

    const events = await getBookingPaymentEvents(booking.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "callback",
      status: "paid",
      outcome: "amount-mismatch",
      amount: "1.00",
      paynowReference: "42",
    });
  });

  test("keeps a forged callback tied to no booking, with only what it claimed", async () => {
    await recordRejectedPaynowCallback("reference=FC-ALRT02&status=Paid&hash=BAD", "hash mismatch");
    const event = await prisma.paymentEvent.findFirstOrThrow({ where: { reference: "FC-ALRT02" } });
    expect(event.bookingId).toBeNull();
    expect(event.outcome).toBe("rejected");
    expect(event.detail).toBe("hash mismatch");
  });
});
