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
  closeUnpaidPastArrival,
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

/** Marks a booking paid (a deposit), as Paynow or staff would. */
const pay = (id: string) =>
  prisma.booking.update({
    where: { id },
    data: { amountPaid: 1, paymentStatus: "partial", bookingStatus: "confirmed" },
  });

/** Moves a payment window into the past, as if the guest never approved the charge. */
const lapse = (id: string) =>
  prisma.booking.update({
    where: { id },
    data: { holdExpiresAt: new Date(Date.now() - 60_000) },
  });

describe("an unpaid booking is a maybe", () => {
  test("it holds nothing: the room stays on sale everywhere", async () => {
    const booking = await book("2045-01-10", "2045-01-12");
    expect(booking.holdExpiresAt).toBeNull();

    expect(await isRoomAvailable(roomId, "2045-01-10", "2045-01-12")).toBe(true);
    const free = await getAvailableRooms("2045-01-10", "2045-01-12", propertyId);
    expect(free.some((room) => room.id === roomId)).toBe(true);
    const occupancy = await getRoomOccupancy(propertyId, { from: "2045-01-01", to: "2045-02-01" });
    const stays = occupancy.find((room) => room.roomId === roomId)?.stays ?? [];
    expect(stays.some((stay) => stay.reference === booking.reference)).toBe(false);
  });

  test("several guests can book the same nights; none of them blocks the others", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) => book("2045-02-10", "2045-02-13", `holds-test-maybe-${i}@example.com`)),
    );
    expect(attempts.every((attempt) => attempt.status === "fulfilled")).toBe(true);
  });
});

describe("only paying secures the room", () => {
  test("a deposit takes the room off sale, and a new booking for those nights is refused", async () => {
    const booking = await book("2045-03-10", "2045-03-12");
    await pay(booking.id);

    expect(await isRoomAvailable(roomId, "2045-03-10", "2045-03-12")).toBe(false);
    expect(await rejection(book("2045-03-10", "2045-03-12", "holds-test-2@example.com"))).toMatch(/already booked/);
  });

  test("starting a payment holds the room while the guest approves it", async () => {
    const booking = await book("2045-04-10", "2045-04-12");
    // Paynow is unconfigured in tests: the charge is refused, but the window was opened first.
    await initiateMobileMoneyPayment(booking.reference, "0777123456");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await isRoomAvailable(roomId, "2045-04-10", "2045-04-12")).toBe(false);

    await lapse(booking.id);
    expect(await isRoomAvailable(roomId, "2045-04-10", "2045-04-12")).toBe(true);
  });
});

describe("paying for a maybe", () => {
  test("is refused when another guest has paid for the dates", async () => {
    const first = await book("2045-06-10", "2045-06-12");
    const second = await book("2045-06-10", "2045-06-12", "holds-test-3@example.com");
    await pay(second.id);

    expect(await rejection(initiateMobileMoneyPayment(first.reference, "0777123456"))).toMatch(/no longer available/);
  });

  test("is refused on the hosted-page rail for the same reason", async () => {
    const first = await book("2045-07-10", "2045-07-12", TEST_EMAIL, "visa");
    const second = await book("2045-07-10", "2045-07-12", "holds-test-4@example.com");
    await pay(second.id);

    expect(await rejection(startWebCheckout(first.reference))).toMatch(/no longer available/);
  });

  test("of several guests starting payments for the same nights at once, only one gets to pay", async () => {
    const maybes = await Promise.all(
      Array.from({ length: 5 }, (_, i) => book("2045-11-10", "2045-11-13", `holds-test-race-${i}@example.com`)),
    );
    const attempts = await Promise.allSettled(
      maybes.map((booking) => initiateMobileMoneyPayment(booking.reference, "0777123456")),
    );
    // The winner resolves (ok:false only because Paynow is unconfigured); the rest are refused.
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await isRoomAvailable(roomId, "2045-11-10", "2045-11-13")).toBe(false);
  });

  test("a payment that lands after its window, with the dates paid for by someone else, is flagged, not confirmed", async () => {
    const first = await book("2045-08-10", "2045-08-12");
    const second = await book("2045-08-10", "2045-08-12", "holds-test-5@example.com");
    await pay(second.id);

    const after = await recordPaynowPaid(await prisma.booking.findUniqueOrThrow({ where: { id: first.id } }), "paid");

    // The money is real, so the payment is recorded...
    expect(after.amountPaid).toBeGreaterThan(0);
    // ...but the room is not handed out twice.
    expect(after.bookingStatus).toBe("pending");
    expect(after.reviewNote).toContain(second.reference);
  });

  test("a payment with the room still free confirms the stay", async () => {
    const booking = await book("2045-09-10", "2045-09-12");
    const after = await recordPaynowPaid(booking, "paid");
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

describe("closeUnpaidPastArrival", () => {
  test("closes maybes whose arrival passed, and leaves upcoming and paid ones alone", async () => {
    const past = await book("2045-05-10", "2045-05-12");
    const paidPast = await book("2045-05-14", "2045-05-16", "holds-test-6@example.com");
    const upcoming = await book("2045-05-20", "2045-05-22");
    const yesterday = new Date(Date.now() - 2 * 86_400_000);
    for (const booking of [past, paidPast]) {
      await prisma.booking.update({ where: { id: booking.id }, data: { checkIn: yesterday, checkOut: new Date() } });
    }
    await pay(paidPast.id);

    await closeUnpaidPastArrival();

    const status = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).bookingStatus;
    expect(await status(past.id)).toBe("expired");
    expect(await status(paidPast.id)).toBe("confirmed");
    expect(await status(upcoming.id)).toBe("pending");
  });
});
