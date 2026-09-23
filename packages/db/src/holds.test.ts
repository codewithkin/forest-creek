import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  createBooking,
  getAvailableRooms,
  getRoomOccupancy,
  isRoomAvailable,
  startWebCheckout,
  initiateMobileMoneyPayment,
  prisma,
  recordPaynowPaid,
  sweepLapsedHolds,
  HOLD_MINUTES,
} from "./index";

/**
 * Against the real dev database, on dates far enough out that no genuine
 * booking can collide. Every row this file makes uses TEST_EMAIL and is
 * removed afterwards.
 */
const TEST_EMAIL = "holds-test@example.com";
let roomId: string;
let propertyId: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: "holds-test" } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  propertyId = room.propertyId;
  await cleanup();
});

afterAll(cleanup);

const book = (checkIn: string, checkOut: string, email = TEST_EMAIL, paymentMethod: "ecocash" | "visa" = "ecocash") =>
  createBooking({
    guestName: "Hold Test",
    guestEmail: email,
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod,
    channel: "web",
  });

/**
 * The message a promise rejects with. Plain try/catch: bun's
 * `expect(promise).rejects` hung on Windows here instead of failing.
 */
async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "(did not reject)";
}

/** Moves a booking's hold into the past, as if the guest had walked away. */
const lapse = (id: string) =>
  prisma.booking.update({
    where: { id },
    data: { holdExpiresAt: new Date(Date.now() - 60_000) },
  });

describe("a new booking's hold", () => {
  test("holds the room for the hold window", async () => {
    const before = Date.now();
    const booking = await book("2045-01-10", "2045-01-12");

    expect(booking.holdExpiresAt).not.toBeNull();
    const minutes = (booking.holdExpiresAt!.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(HOLD_MINUTES - 1);
    expect(minutes).toBeLessThanOrEqual(HOLD_MINUTES + 1);
    expect(await isRoomAvailable(roomId, "2045-01-10", "2045-01-12")).toBe(false);
  });

  test("once it lapses the dates are free everywhere, before any sweep has run", async () => {
    const booking = await book("2045-02-10", "2045-02-12");
    await lapse(booking.id);

    expect(await isRoomAvailable(roomId, "2045-02-10", "2045-02-12")).toBe(true);
    const free = await getAvailableRooms("2045-02-10", "2045-02-12", propertyId);
    expect(free.some((room) => room.id === roomId)).toBe(true);
    const occupancy = await getRoomOccupancy(propertyId, { from: "2045-02-01", to: "2045-03-01" });
    const stays = occupancy.find((room) => room.roomId === roomId)?.stays ?? [];
    expect(stays.some((stay) => stay.reference === booking.reference)).toBe(false);
  });

  test("a second guest can book the dates a lapsed hold let go", async () => {
    const first = await book("2045-03-10", "2045-03-12");
    await lapse(first.id);

    const second = await book("2045-03-10", "2045-03-12", "holds-test-2@example.com");
    expect(second.reference).not.toBe(first.reference);
  });

  test("a paid booking never lapses, whatever its hold says", async () => {
    const booking = await book("2045-04-10", "2045-04-12");
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "verified", holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    expect(await isRoomAvailable(roomId, "2045-04-10", "2045-04-12")).toBe(false);
  });
});

describe("sweepLapsedHolds", () => {
  test("marks a lapsed, unpaid hold expired and leaves a live one alone", async () => {
    const stale = await book("2045-05-10", "2045-05-12");
    const live = await book("2045-05-20", "2045-05-22");
    await lapse(stale.id);

    await sweepLapsedHolds();

    const [staleAfter, liveAfter] = await Promise.all([
      prisma.booking.findUniqueOrThrow({ where: { id: stale.id } }),
      prisma.booking.findUniqueOrThrow({ where: { id: live.id } }),
    ]);
    expect(staleAfter.bookingStatus).toBe("expired");
    expect(liveAfter.bookingStatus).toBe("pending");
  });
});

describe("paying for a lapsed hold", () => {
  test("is refused when someone else has taken the dates since", async () => {
    const first = await book("2045-06-10", "2045-06-12");
    await lapse(first.id);
    await book("2045-06-10", "2045-06-12", "holds-test-3@example.com");

    expect(await rejection(initiateMobileMoneyPayment(first.reference, "0777123456"))).toMatch(
      /taken/,
    );
  });

  test("is refused on the hosted-page rail for the same reason", async () => {
    const first = await book("2045-07-10", "2045-07-12", TEST_EMAIL, "visa");
    await lapse(first.id);
    await book("2045-07-10", "2045-07-12", "holds-test-4@example.com");

    expect(await rejection(startWebCheckout(first.reference))).toMatch(/taken/);
  });

  test("a payment that lands after the hold lapsed and the room was re-booked is flagged, not confirmed", async () => {
    const first = await book("2045-08-10", "2045-08-12");
    await lapse(first.id);
    const second = await book("2045-08-10", "2045-08-12", "holds-test-5@example.com");

    const after = await recordPaynowPaid(
      await prisma.booking.findUniqueOrThrow({ where: { id: first.id } }),
      "paid",
    );

    // The money is real, so the payment is recorded...
    expect(after.paymentStatus).toBe("verified");
    // ...but the room is not handed out twice.
    expect(after.bookingStatus).toBe("pending");
    expect(after.reviewNote).toContain(second.reference);
  });

  test("a payment that lands after the hold lapsed, with the room still free, confirms the stay", async () => {
    const booking = await book("2045-09-10", "2045-09-12");
    const lapsed = await lapse(booking.id);

    const after = await recordPaynowPaid(lapsed, "paid");
    expect(after.bookingStatus).toBe("confirmed");
    expect(after.reviewNote).toBeNull();
  });

  test("recording the same payment twice changes nothing the second time", async () => {
    const booking = await book("2045-10-10", "2045-10-12");
    const first = await recordPaynowPaid(booking, "paid");
    const second = await recordPaynowPaid(booking, "paid");
    expect(second.updatedAt).toEqual(first.updatedAt);
  });
});
