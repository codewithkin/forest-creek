import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { addDays, createRoom, createStaffBooking, getTrends, lodgeToday, prisma } from "./index";

/** Trends against the dev database, on two throwaway properties around today. */
const SLUGS = ["trends-test-a", "trends-test-b"] as const;
const BY = "manager@example.com";
let propertyA: string;
let propertyB: string;
let roomA: string;
let roomB: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { property: { slug: { in: [...SLUGS] } } } });
  await prisma.property.deleteMany({ where: { slug: { in: [...SLUGS] } } });
}

async function house(slug: string, price: number) {
  const property = await prisma.property.create({
    data: { slug, name: slug, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  const room = await createRoom({ propertyId: property.id, name: "Room", description: "-", pricePerNight: price, capacity: 4, bedType: "-", images: ["/media/x.jpg"] });
  return { propertyId: property.id, roomId: room.id };
}

const today = lodgeToday();
const paid = (roomId: string, from: number, to: number) =>
  createStaffBooking(
    { roomId, checkIn: addDays(today, from), checkOut: addDays(today, to), guests: 2, guestName: "Trend", source: "phone", payment: { kind: "arrival" } },
    BY,
  );

beforeAll(async () => {
  await cleanup();
  ({ propertyId: propertyA, roomId: roomA } = await house(SLUGS[0], 100));
  ({ propertyId: propertyB, roomId: roomB } = await house(SLUGS[1], 300));
  await paid(roomA, -10, -6); // 4 nights at $100
  await paid(roomB, -9, -7); // 2 nights at $300
  await paid(roomA, 5, 8); // ahead: 3 nights on the books
  await createStaffBooking(
    { roomId: roomB, checkIn: addDays(today, -5), checkOut: addDays(today, -3), guests: 2, guestName: "Unpaid", source: "phone", payment: { kind: "none" } },
    BY,
  );
});
afterAll(cleanup);

describe("getTrends", () => {
  test("names the best performer, from paid stays only", async () => {
    const trends = await getTrends({ months: 3 }, [propertyA, propertyB]);
    expect(trends.properties.map((row) => [row.name, row.roomRevenue, row.nightsSold])).toEqual([
      [SLUGS[1], 600, 2],
      [SLUGS[0], 400, 4],
    ]);
    expect(trends.properties[0]!.share).toBeCloseTo(0.6, 9);
  });

  test("group figures come from summed nights, and RevPAR holds", async () => {
    const { current } = await getTrends({ months: 3 }, [propertyA, propertyB]);
    expect(current.nightsSold).toBe(6);
    expect(current.roomRevenue).toBe(1000);
    expect(current.adr).toBeCloseTo(1000 / 6, 9);
    expect(current.revpar).toBeCloseTo(current.adr * current.occupancy, 9);
  });

  test("monthly figures add up to the whole", async () => {
    const trends = await getTrends({ months: 3 }, [propertyA, propertyB]);
    expect(trends.monthly).toHaveLength(3);
    expect(trends.monthly.reduce((sum, month) => sum + month.roomRevenue, 0)).toBe(trends.current.roomRevenue);
  });

  test("looks ahead at what is already booked", async () => {
    const { forwards } = await getTrends({ months: 3 }, [propertyA, propertyB]);
    expect(forwards.map((row) => [row.days, row.nightsSold])).toEqual([
      [30, 3],
      [60, 3],
      [90, 3],
    ]);
  });

  test("counts confirmed stays as secured and unpaid ones not, and stays in scope", async () => {
    const trends = await getTrends({ months: 3 }, [propertyA, propertyB]);
    // Three confirmed (pay on arrival), one unpaid.
    expect(trends.conversion).toBe(0.75);
    const mine = await getTrends({ months: 3 }, [propertyA]);
    expect(mine.properties.map((row) => row.name)).toEqual([SLUGS[0]]);
    expect(mine.current.roomRevenue).toBe(400);
  });

  test("with a few stays it holds back from drawing conclusions", async () => {
    expect((await getTrends({ months: 3 }, [propertyA, propertyB])).insights).toEqual([]);
  });

  test("an empty scope gives zeros, not a crash", async () => {
    const empty = await getTrends({ months: 12 }, ["no-such-property"]);
    expect(empty.current.roomRevenue).toBe(0);
    expect(empty.conversion).toBeNull();
    expect(empty.properties).toEqual([]);
  });
});
