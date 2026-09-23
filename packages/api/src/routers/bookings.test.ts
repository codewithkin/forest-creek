import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { cancelBooking, createBooking, prisma, recordPaynowPaid } from "@forest-creek/db";

import { t } from "../index";
import { analyticsRouter } from "./analytics";
import { bookingsRouter } from "./bookings";

/**
 * The staff-only booking procedures, called the way tRPC calls them, against
 * the dev database. What matters here is the boundary: a manager of one
 * property must not read or act on another property's bookings.
 */
const PREFIX = "api-bookings-test";
const createCaller = t.createCallerFactory(bookingsRouter);

type Role = "admin" | "manager" | "guest";
const callerAs = (id: string, role: Role) =>
  createCaller({
    session: { user: { id, role, email: `${id}@example.com` } },
  } as unknown as Parameters<typeof createCaller>[0]);

let bookingId: string;
let roomId: string;
let otherPropertyId: string;
const managerId = `${PREFIX}-manager`;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
  await prisma.roomBlock.deleteMany({ where: { reason: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.property.deleteMany({ where: { slug: PREFIX } });
}

beforeAll(async () => {
  await cleanup();
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");

  const booking = await createBooking({
    guestName: "Api Test",
    guestEmail: `${PREFIX}@example.com`,
    roomId: room.id,
    checkIn: "2050-02-10",
    checkOut: "2050-02-12",
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });
  bookingId = booking.id;
  roomId = room.id;

  // A manager who runs a different house entirely.
  const other = await prisma.property.create({
    data: {
      slug: PREFIX,
      name: "Other House",
      tagline: "-",
      description: "-",
      location: "-",
      phone: "-",
      email: "other@example.com",
      heroImage: "/media/x.jpg",
      active: false,
    },
  });
  otherPropertyId = other.id;
  await prisma.user.create({
    data: { id: managerId, name: "Other Manager", email: `${managerId}@example.com`, role: "manager" },
  });
  await prisma.staffProperty.create({ data: { userId: managerId, propertyId: otherPropertyId } });
});

afterAll(cleanup);

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("bookings.notifications", () => {
  test("the owner sees the emails a booking produced", async () => {
    const emails = await callerAs("owner", "admin").notifications(bookingId);
    expect(emails.map((e) => `${e.event}:${e.audience}`).sort()).toEqual([
      "created:guest",
      "created:staff",
    ]);
  });

  test("a manager of another property is refused", async () => {
    expect(await code(callerAs(managerId, "manager").notifications(bookingId))).toBe("FORBIDDEN");
  });

  test("a guest account is refused", async () => {
    expect(await code(callerAs("someone", "guest").notifications(bookingId))).toBe("FORBIDDEN");
  });
});

describe("bookings.retryNotification", () => {
  test("puts a skipped email back in the queue", async () => {
    const [email] = await prisma.notification.findMany({ where: { bookingId } });
    await prisma.notification.update({
      where: { id: email!.id },
      data: { status: "skipped", lastError: "Email is not configured" },
    });

    const retried = await callerAs("owner", "admin").retryNotification(email!.id);
    expect(retried.status).toBe("pending");
    expect(retried.lastError).toBeNull();
  });

  test("a manager of another property cannot retry this booking's email", async () => {
    const [email] = await prisma.notification.findMany({ where: { bookingId } });
    expect(await code(callerAs(managerId, "manager").retryNotification(email!.id))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("bookings.reconcile", () => {
  test("says plainly when no charge was ever started, and confirms nothing", async () => {
    const result = await callerAs("owner", "admin").reconcile(bookingId);
    expect(result).toEqual({ ok: false, error: "No payment has been started for this booking yet." });
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.paymentStatus).toBe("pending");
  });

  test("a manager of another property is refused", async () => {
    expect(await code(callerAs(managerId, "manager").reconcile(bookingId))).toBe("FORBIDDEN");
  });
});

describe("bookings.blockDates / unblockDates", () => {
  test("the owner can block and then unblock a room's nights", async () => {
    const owner = callerAs("owner", "admin");
    const block = await owner.blockDates({
      roomId,
      from: "2050-03-01",
      to: "2050-03-04",
      reason: `${PREFIX} maintenance`,
    });
    expect(block?.createdBy).toBe("owner@example.com");

    await owner.unblockDates(block!.id);
    expect(await prisma.roomBlock.findUnique({ where: { id: block!.id } })).toBeNull();
  });

  test("blocking over a guest's stay is a CONFLICT", async () => {
    expect(
      await code(
        callerAs("owner", "admin").blockDates({
          roomId,
          from: "2050-02-09",
          to: "2050-02-11",
          reason: `${PREFIX} clash`,
        }),
      ),
    ).toBe("CONFLICT");
  });

  test("a manager of another property cannot block this room or lift its blocks", async () => {
    const manager = callerAs(managerId, "manager");
    expect(
      await code(
        manager.blockDates({ roomId, from: "2050-04-01", to: "2050-04-02", reason: `${PREFIX} x` }),
      ),
    ).toBe("FORBIDDEN");

    const block = await callerAs("owner", "admin").blockDates({
      roomId,
      from: "2050-05-01",
      to: "2050-05-02",
      reason: `${PREFIX} owners`,
    });
    expect(await code(manager.unblockDates(block!.id))).toBe("FORBIDDEN");
  });
});

describe("rate limits on the public payment procedures", () => {
  const guest = (ip: string) =>
    createCaller({ session: null, clientIp: ip } as unknown as Parameters<typeof createCaller>[0]);

  test("one booking cannot have PIN prompts pushed at it again and again, even from many addresses", async () => {
    const reference = (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).reference;
    const codes: string[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push(
        await code(guest(`198.51.100.${i}`).payWithMobileMoney({ reference, mobileMoneyNumber: "0777123456" })),
      );
    }
    // Paynow is unconfigured in tests, so the first five get as far as a
    // polite "not set up" and resolve; the rest are refused before that.
    expect(codes.slice(0, 5).every((c) => c === "OK")).toBe(true);
    expect(codes.slice(5)).toEqual(["TOO_MANY_REQUESTS", "TOO_MANY_REQUESTS"]);
  });

  test("one address cannot poll without end, but another address is unaffected", async () => {
    const reference = (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).reference;
    const noisy = guest("203.0.113.50");
    let refused = 0;
    for (let i = 0; i < 65; i++) {
      if ((await code(noisy.checkPayment({ reference }))) === "TOO_MANY_REQUESTS") refused++;
    }
    expect(refused).toBe(5);
    expect(await code(guest("203.0.113.51").checkPayment({ reference }))).not.toBe("TOO_MANY_REQUESTS");
  });
});

describe("bookings.recordRefund", () => {
  async function paidAndCancelled(checkIn: string, checkOut: string) {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    const booking = await createBooking({
      guestName: "Api Refund",
      guestEmail: `${PREFIX}-refund-${checkIn}@example.com`,
      roomId: room.id,
      checkIn,
      checkOut,
      guests: 1,
      activityIds: [],
      paymentMethod: "ecocash",
      channel: "web",
    });
    await recordPaynowPaid(booking, "paid");
    return cancelBooking(booking.id, "owner@example.com");
  }

  test("the owner records a refund with its reference", async () => {
    const booking = await paidAndCancelled("2050-06-01", "2050-06-03");
    const after = await callerAs("owner", "admin").recordRefund({
      id: booking.id,
      outcome: "refunded",
      note: "EcoCash MP1",
    });
    expect(after?.refundStatus).toBe("refunded");
    expect(after?.refundedBy).toBe("owner@example.com");
  });

  test("recording it again is a CONFLICT, not a second record", async () => {
    const booking = await paidAndCancelled("2050-07-01", "2050-07-03");
    const owner = callerAs("owner", "admin");
    await owner.recordRefund({ id: booking.id, outcome: "declined", note: "Policy" });
    expect(await code(owner.recordRefund({ id: booking.id, outcome: "refunded", note: "x" }))).toBe(
      "CONFLICT",
    );
  });

  test("a manager of another property cannot record it", async () => {
    const booking = await paidAndCancelled("2050-08-01", "2050-08-03");
    expect(
      await code(
        callerAs(managerId, "manager").recordRefund({ id: booking.id, outcome: "refunded", note: "x" }),
      ),
    ).toBe("FORBIDDEN");
  });
});

describe("analytics.alerts", () => {
  const analyticsAs = (id: string, role: Role) =>
    t.createCallerFactory(analyticsRouter)({
      session: { user: { id, role, email: `${id}@example.com` } },
    } as unknown as Parameters<typeof createCaller>[0]);

  test("a manager sees only their own property's bookings, and no forged callbacks", async () => {
    await prisma.booking.update({ where: { id: bookingId }, data: { reviewNote: `${PREFIX} check this` } });
    const manager = await analyticsAs(managerId, "manager").alerts();
    expect(manager.items.some((item) => item.bookingId === bookingId)).toBe(false);
    expect(manager.counts.rejectedCallbacks).toBe(0);

    const owner = await analyticsAs("owner", "admin").alerts();
    expect(owner.items.some((item) => item.bookingId === bookingId && item.kind === "review")).toBe(true);
    await prisma.booking.update({ where: { id: bookingId }, data: { reviewNote: null } });
  });

  test("a manager asking for another property's alerts is refused", async () => {
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId } });
    expect(await code(analyticsAs(managerId, "manager").alerts({ propertyId: room.propertyId }))).toBe(
      "FORBIDDEN",
    );
  });
});

describe("bookings.paymentEvents", () => {
  test("a manager of another property cannot read a booking's payment log", async () => {
    expect(await code(callerAs(managerId, "manager").paymentEvents(bookingId))).toBe("FORBIDDEN");
    expect(await callerAs("owner", "admin").paymentEvents(bookingId)).toEqual([]);
  });
});
