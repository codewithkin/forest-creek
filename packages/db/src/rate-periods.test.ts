import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  changeBookingDates,
  createBooking,
  createRatePeriods,
  createRoom,
  deleteRatePeriod,
  getAvailableRooms,
  getDateChangeQuote,
  listRatePeriods,
  prisma,
} from "./index";

/** Prices by date, against the dev database on a throwaway property, years ahead. */
const SLUG = "rate-periods-test";
const EMAIL = "rate-periods-test@example.com";
const BY = "staff@example.com";
let propertyId: string;
let roomId: string;
let otherRoomId: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: {
      slug: SLUG, name: "Rate House", tagline: "-", description: "-", location: "-", phone: "-",
      email: "rates@example.com", heroImage: "/media/x.jpg", sortOrder: 999,
    },
  });
  propertyId = property.id;
  const room = (tier: string, price: number) =>
    createRoom({
      propertyId, tier, name: tier, description: "-", pricePerNight: price, capacity: 2, bedType: "-", images: ["/media/x.jpg"],
    });
  roomId = (await room("suite", 120)).id;
  otherRoomId = (await room("twin", 80)).id;
});
afterAll(cleanup);

const book = (checkIn: string, checkOut: string) =>
  createBooking({
    guestName: "Rate Guest", guestEmail: EMAIL, roomId, checkIn, checkOut, guests: 1,
    activityIds: [], paymentMethod: "ecocash", channel: "web",
  });

describe("prices by date", () => {
  test("staff price several rooms for a holiday at once; it lists with the normal rate beside it", async () => {
    expect(
      await createRatePeriods(
        { roomIds: [roomId, otherRoomId], name: "Christmas", from: "2045-12-24", lastNight: "2045-12-26", pricePerNight: 200 },
        BY,
      ),
    ).toEqual({ created: 2 });
    const listed = await listRatePeriods(propertyId, "2045-12-01");
    expect(listed.find((period) => period.roomId === roomId)).toMatchObject({
      name: "Christmas", from: "2045-12-24", lastNight: "2045-12-26", pricePerNight: 200, normalRate: 120,
    });
  });

  test("a second price on any of the same nights is refused, naming the first", async () => {
    await expect(
      createRatePeriods({ roomIds: [roomId], name: "Boxing Day", from: "2045-12-26", lastNight: "2045-12-28", pricePerNight: 150 }, BY),
    ).rejects.toThrow(/Christmas/);
    // The night after the last one is free to price.
    expect(
      await createRatePeriods({ roomIds: [roomId], name: "New Year", from: "2045-12-27", lastNight: "2045-12-31", pricePerNight: 180 }, BY),
    ).toEqual({ created: 1 });
  });

  test("availability quotes each room for exactly the nights asked", async () => {
    const rooms = await getAvailableRooms("2045-12-22", "2045-12-26", propertyId);
    // 22nd, 23rd at 120; 24th, 25th at 200.
    expect(rooms.find((room) => room.id === roomId)?.stay).toMatchObject({ subtotal: 640, nightlyRates: [120, 120, 200, 200] });
    expect(rooms.find((room) => room.id === otherRoomId)?.stay.subtotal).toBe(80 * 2 + 200 * 2);
  });

  test("a booking is charged night by night and keeps each night's price", async () => {
    const booking = await book("2045-12-22", "2045-12-26");
    expect(booking).toMatchObject({ subtotal: 640, totalAmount: 640, roomRate: 160, nightlyRates: [120, 120, 200, 200] });
  });

  test("removing a price leaves bookings made at it alone", async () => {
    const before = await prisma.booking.findFirst({ where: { guestEmail: EMAIL, checkIn: new Date("2045-12-22T00:00:00Z") } });
    for (const period of await listRatePeriods(propertyId, "2045-12-01")) {
      if (period.name === "Christmas" && period.roomId === otherRoomId) await deleteRatePeriod(period.id);
    }
    const after = await prisma.booking.findUnique({ where: { id: before!.id } });
    expect(after?.subtotal).toBe(640);
  });

  test("a date change is quoted and repriced at the prices for the new nights", async () => {
    const booking = await book("2045-11-10", "2045-11-12");
    expect(booking.subtotal).toBe(240);
    const quote = await getDateChangeQuote(booking.id, "2045-12-28", "2045-12-30");
    expect(quote).toMatchObject({ newTotal: 360, difference: 120 });
    const moved = await changeBookingDates(
      { id: booking.id, checkIn: "2045-12-28", checkOut: "2045-12-30", override: true },
      BY,
    );
    expect(moved).toMatchObject({ subtotal: 360, nightlyRates: [180, 180] });
  });
});
