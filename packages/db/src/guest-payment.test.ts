import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { choosePaymentMethod, createBooking, getGuestBookingView, prisma } from "./index";

const TEST_EMAIL = "guest-pay-test@example.com";
let roomId: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: TEST_EMAIL } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  await cleanup();
});

afterAll(cleanup);

const book = (checkIn: string, checkOut: string) =>
  createBooking({
    guestName: "Private Person",
    guestEmail: TEST_EMAIL,
    guestPhone: "+263770000123",
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    notes: "Allergic to peanuts",
    channel: "web",
  });

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "(did not reject)";
}

describe("getGuestBookingView", () => {
  test("gives what paying needs and nothing that identifies the guest", async () => {
    const booking = await book("2046-01-10", "2046-01-13");
    const view = await getGuestBookingView(booking.reference.toLowerCase());

    expect(view).not.toBeNull();
    expect(view!.reference).toBe(booking.reference);
    expect(view!.nights).toBe(3);
    expect(view!.totalAmount).toBe(booking.totalAmount);
    expect(view!.holdLapsed).toBe(false);

    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain(TEST_EMAIL);
    expect(serialised).not.toContain("+263770000123");
    expect(serialised).not.toContain("Private Person");
    expect(serialised).not.toContain("peanuts");
  });

  test("an unknown reference is simply not found", async () => {
    expect(await getGuestBookingView("FC-ZZZZZZ")).toBeNull();
  });
});

describe("choosePaymentMethod", () => {
  test("switches an unpaid booking to another Paynow method", async () => {
    const booking = await book("2046-02-10", "2046-02-12");
    const view = await choosePaymentMethod(booking.reference, "visa");
    expect(view.paymentMethod).toBe("visa");
  });

  test("refuses to touch a booking that is already paid", async () => {
    const booking = await book("2046-03-10", "2046-03-12");
    await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: "verified" } });
    expect(await rejection(choosePaymentMethod(booking.reference, "innbucks"))).toMatch(/paid/);
  });

  test("refuses a cancelled booking", async () => {
    const booking = await book("2046-04-10", "2046-04-12");
    await prisma.booking.update({ where: { id: booking.id }, data: { bookingStatus: "cancelled" } });
    expect(await rejection(choosePaymentMethod(booking.reference, "visa"))).toMatch(/cancelled/);
  });
});
