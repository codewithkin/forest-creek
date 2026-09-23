import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  cancelBooking,
  createBooking,
  deliverDueNotifications,
  getBookingNotifications,
  MAX_NOTIFICATION_ATTEMPTS,
  prisma,
  recordPaynowPaid,
  retryNotification,
  sweepLapsedHolds,
  type OutgoingEmail,
} from "./index";

/**
 * Against the dev database on far-future dates. Every booking here uses this
 * prefix and is removed afterwards; its notifications go with it (cascade).
 * Delivery is always scoped to this file's bookings, so a test run never
 * marks a real guest's email sent.
 */
const PREFIX = "notify-test";
let roomId: string;
let propertyEmail: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: { property: true },
  });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  propertyEmail = room.property.email;
  await cleanup();
});
afterAll(cleanup);

let month = 1;
async function book() {
  const m = String(month++).padStart(2, "0");
  return createBooking({
    guestName: "Notify Test",
    guestEmail: `${PREFIX}-${m}@example.com`,
    roomId,
    checkIn: `2048-${m}-10`,
    checkOut: `2048-${m}-12`,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });
}

const events = async (bookingId: string) =>
  (await getBookingNotifications(bookingId)).map((n) => `${n.event}:${n.audience}`).sort();

function recorder() {
  const sent: OutgoingEmail[] = [];
  return { sent, send: async (email: OutgoingEmail) => void sent.push(email) };
}

describe("queueing", () => {
  test("a new booking queues a pending-payment email to the guest and an alert to the property", async () => {
    const booking = await book();
    const queued = await getBookingNotifications(booking.id);
    expect(queued.map((n) => `${n.event}:${n.audience}:${n.recipient}`).sort()).toEqual([
      `created:guest:${booking.guestEmail}`,
      `created:staff:${propertyEmail}`,
    ]);
    expect(queued.every((n) => n.status === "pending")).toBe(true);
  });

  test("a payment reported twice (poll and callback) queues one confirmation each", async () => {
    const booking = await book();
    await recordPaynowPaid(booking, "paid");
    await recordPaynowPaid(booking, "paid");
    expect(await events(booking.id)).toEqual([
      "confirmed:guest",
      "confirmed:staff",
      "created:guest",
      "created:staff",
    ]);
  });

  test("a cancellation tells the guest and the property", async () => {
    const booking = await book();
    await cancelBooking(booking.id, "staff@example.com", "Guest phoned to cancel");
    expect(await events(booking.id)).toContain("cancelled:guest");
    expect(await events(booking.id)).toContain("cancelled:staff");
  });

  test("a lapsed hold tells only the guest", async () => {
    const booking = await book();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    await sweepLapsedHolds();
    const expired = (await events(booking.id)).filter((e) => e.startsWith("expired"));
    expect(expired).toEqual(["expired:guest"]);
  });
});

describe("delivery", () => {
  test("sends what is due and marks it sent", async () => {
    const booking = await book();
    const mail = recorder();
    const result = await deliverDueNotifications({
      send: mail.send,
      configured: true,
      bookingIds: [booking.id],
    });
    expect(result.sent).toBe(2);
    expect(mail.sent.map((e) => e.to).sort()).toEqual([booking.guestEmail, propertyEmail].sort());
    expect(mail.sent.every((e) => e.text.includes(booking.reference))).toBe(true);

    const after = await getBookingNotifications(booking.id);
    expect(after.every((n) => n.status === "sent" && n.sentAt && n.attempts === 1)).toBe(true);

    // Nothing is sent twice.
    const again = await deliverDueNotifications({
      send: mail.send,
      configured: true,
      bookingIds: [booking.id],
    });
    expect(again.sent).toBe(0);
  });

  test("a mail failure is retried later, then given up on and shown as failed", async () => {
    const booking = await book();
    const failing = async () => {
      throw new Error("421 mail server busy");
    };

    const first = await deliverDueNotifications({
      send: failing,
      configured: true,
      bookingIds: [booking.id],
    });
    expect(first.retrying).toBe(2);
    let rows = await getBookingNotifications(booking.id);
    expect(rows.every((n) => n.status === "pending" && n.attempts === 1)).toBe(true);
    expect(rows.every((n) => n.nextAttemptAt.getTime() > Date.now())).toBe(true);
    expect(rows[0]!.lastError).toContain("421");

    // Run the clock forward past every backoff until it gives up.
    let now = Date.now();
    for (let i = 1; i < MAX_NOTIFICATION_ATTEMPTS; i++) {
      now += 2 * 60 * 60_000;
      await deliverDueNotifications({
        send: failing,
        configured: true,
        bookingIds: [booking.id],
        now: new Date(now),
      });
    }
    rows = await getBookingNotifications(booking.id);
    expect(
      rows.every((n) => n.status === "failed" && n.attempts === MAX_NOTIFICATION_ATTEMPTS),
    ).toBe(true);

    // A staff retry puts it back, and a working mail server then sends it.
    for (const row of rows) await retryNotification(row.id);
    const mail = recorder();
    const retried = await deliverDueNotifications({
      send: mail.send,
      configured: true,
      bookingIds: [booking.id],
    });
    expect(retried.sent).toBe(2);
  });

  test("with mail unconfigured, due messages are marked skipped rather than piling up", async () => {
    const booking = await book();
    const mail = recorder();
    const result = await deliverDueNotifications({
      send: mail.send,
      configured: false,
      bookingIds: [booking.id],
    });
    expect(result.skipped).toBe(2);
    expect(mail.sent).toHaveLength(0);
    const rows = await getBookingNotifications(booking.id);
    expect(rows.every((n) => n.status === "skipped" && n.lastError?.includes("SMTP"))).toBe(true);
  });

  test("two workers delivering at once send each message only once", async () => {
    const booking = await book();
    const mail = recorder();
    await Promise.all([
      deliverDueNotifications({ send: mail.send, configured: true, bookingIds: [booking.id] }),
      deliverDueNotifications({ send: mail.send, configured: true, bookingIds: [booking.id] }),
    ]);
    expect(mail.sent).toHaveLength(2);
  });
});
