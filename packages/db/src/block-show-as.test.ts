import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createRoom, createRoomBlock, getRoomPriceCalendar, prisma } from "./index";

/** Room blocks shown to guests as "booked" or "blocked", against the dev database. */
const SLUG = "block-show-as-test";
let roomId: string;

async function cleanup() {
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: { slug: SLUG, name: SLUG, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  roomId = (await createRoom({ propertyId: property.id, name: "Room", description: "-", pricePerNight: 100, capacity: 2, bedType: "-", images: ["/media/x.jpg"] })).id;
  await createRoomBlock({ roomId, from: "2033-03-01", to: "2033-03-03", reason: "Private event", showAs: "booked" }, "staff@example.com");
  await createRoomBlock({ roomId, from: "2033-03-05", to: "2033-03-06", reason: "Repainting" }, "staff@example.com");
});
afterAll(cleanup);

describe("what guests see for blocked dates", () => {
  test("a block shown as booked reads as booked to guests; the default reads as closed", async () => {
    const guest = await getRoomPriceCalendar({ roomId, from: "2033-03-01", to: "2033-03-07" });
    const day = (date: string) => guest!.days.find((candidate) => candidate.date === date)!;
    expect([day("2033-03-01").booked, day("2033-03-01").blocked]).toEqual([true, false]);
    expect([day("2033-03-05").booked, day("2033-03-05").blocked]).toEqual([false, true]);
    expect([day("2033-03-04").booked, day("2033-03-04").blocked]).toEqual([false, false]);
  });

  test("staff always see the block as a block", async () => {
    const staff = await getRoomPriceCalendar({ roomId, from: "2033-03-01", to: "2033-03-07" }, true);
    const first = staff!.days.find((candidate) => candidate.date === "2033-03-01")!;
    expect([first.booked, first.blocked]).toEqual([false, true]);
  });
});
