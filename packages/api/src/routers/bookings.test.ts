import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createBooking, prisma } from "@forest-creek/db";

import { t } from "../index";
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
