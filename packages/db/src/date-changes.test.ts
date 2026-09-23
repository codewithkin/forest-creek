import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  changeBookingDates,
  createBooking,
  getBookingNotifications,
  getDateChangeQuote,
  isRoomAvailable,
  lodgeToday,
  prisma,
  recordPaynowPaid,
  seasonOf,
} from "./index";

/** Clause 4 against the dev database; every booking here is removed afterwards. */
const PREFIX = "date-change-test";
let roomId: string;
let rate: number;

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { guestEmail: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  rate = room.pricePerNight;
  await cleanup();
});
afterAll(cleanup);

let n = 1;
const book = (checkIn: string, checkOut: string) =>
  createBooking({
    guestName: "Date Change",
    guestEmail: `${PREFIX}-${n++}@example.com`,
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("changeBookingDates", () => {
  test("the first change to a low-season stay far ahead is free, repriced and emailed", async () => {
    const booking = await book("2055-03-10", "2055-03-12");
    const quote = await getDateChangeQuote(booking.id, "2055-03-20", "2055-03-23");
    expect(quote).toMatchObject({ verdict: { kind: "free" }, nights: 3, newTotal: rate * 3, available: true });

    const moved = await changeBookingDates(
      { id: booking.id, checkIn: "2055-03-20", checkOut: "2055-03-23" },
      "manager@example.com",
    );
    expect(moved.checkIn.toISOString().slice(0, 10)).toBe("2055-03-20");
    expect(moved.nights).toBe(3);
    expect(moved.totalAmount).toBe(rate * 3);
    expect(moved.depositAmount).toBe(Math.ceil((rate * 3) / 2));
    expect(moved.balanceDueAt?.toISOString().slice(0, 10)).toBe("2055-03-06");
    expect(moved.dateChanges).toBe(1);
    expect(moved.notes).toContain("the free change");
    // The old nights are free again, the new ones are taken.
    expect(await isRoomAvailable(roomId, "2055-03-10", "2055-03-12")).toBe(true);
    expect(await isRoomAvailable(roomId, "2055-03-20", "2055-03-23")).toBe(false);

    const emails = (await getBookingNotifications(booking.id)).map((e) => e.event);
    expect(emails).toContain("amended:1");
  });

  test("a second change is not free: refused unless staff override, then emailed again", async () => {
    const booking = await book("2055-04-10", "2055-04-12");
    await changeBookingDates({ id: booking.id, checkIn: "2055-04-15", checkOut: "2055-04-17" }, "m@example.com");
    expect(
      await code(changeBookingDates({ id: booking.id, checkIn: "2055-04-20", checkOut: "2055-04-22" }, "m@example.com")),
    ).toBe("DATE_CHANGE_NOT_FREE");

    const again = await changeBookingDates(
      { id: booking.id, checkIn: "2055-04-20", checkOut: "2055-04-22", override: true, reason: "Guest asked nicely" },
      "m@example.com",
    );
    expect(again.dateChanges).toBe(2);
    expect(again.notes).toContain("agreed by staff");
    const emails = (await getBookingNotifications(booking.id)).map((e) => e.event);
    expect(emails).toContain("amended:2");
  });

  test("cannot move onto nights someone else holds", async () => {
    const mine = await book("2055-05-10", "2055-05-12");
    await book("2055-05-20", "2055-05-22");
    expect(
      await code(changeBookingDates({ id: mine.id, checkIn: "2055-05-21", checkOut: "2055-05-23" }, "m@example.com")),
    ).toBe("ROOM_UNAVAILABLE");
  });

  test("a deposit already paid is kept, and the balance recalculated on the new total", async () => {
    const booking = await book("2055-11-10", "2055-11-12");
    const paid = await recordPaynowPaid(
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paynowChargeAmount: booking.depositAmount,
          paynowPollUrl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=dc-" + booking.reference,
        },
      }),
      "paid",
    );
    const moved = await changeBookingDates(
      { id: booking.id, checkIn: "2055-11-10", checkOut: "2055-11-14" },
      "m@example.com",
    );
    expect(moved.amountPaid).toBe(paid.amountPaid);
    expect(moved.depositAmount).toBe(booking.depositAmount);
    expect(moved.totalAmount).toBe(rate * 4);
    expect(moved.paymentStatus).toBe("partial");
  });

  test("a high-season stay within 30 days cannot be moved (it would be a cancellation)", async () => {
    const today = lodgeToday();
    let checkIn: string | undefined;
    for (let offset = 5; offset <= 28 && !checkIn; offset++) {
      const day = addDays(today, offset);
      if (seasonOf(day) === "high" && (await isRoomAvailable(roomId, day, addDays(day, 1)))) checkIn = day;
    }
    if (!checkIn) return; // not high season in the next month, or no free night: nothing to test
    const booking = await book(checkIn, addDays(checkIn, 1));
    expect(
      await code(
        changeBookingDates(
          { id: booking.id, checkIn: addDays(checkIn, 60), checkOut: addDays(checkIn, 61), override: true },
          "m@example.com",
        ),
      ),
    ).toBe("DATE_CHANGE_REFUSED");
  });
});
