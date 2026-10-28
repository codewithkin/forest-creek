import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createRoom, firstFreeCode, prisma, slugifyRoomName, updateRoom } from "./index";

describe("room short codes", () => {
  test("are made from the name", () => {
    expect(slugifyRoomName("Caraway Suite")).toBe("caraway-suite");
    expect(slugifyRoomName("  Café — Room #2 ")).toBe("cafe-room-2");
    expect(slugifyRoomName("!!!")).toBe("room");
  });

  test("take the first free number when the name is already used", () => {
    expect(firstFreeCode("caraway", new Set())).toBe("caraway");
    expect(firstFreeCode("caraway", new Set(["caraway", "caraway-2"]))).toBe("caraway-3");
  });
});

const SLUG = "rooms-test-house";

async function cleanup() {
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(cleanup);
afterAll(cleanup);

describe("adding rooms", () => {
  // Seen live: a second room with a code already in use failed with Prisma's
  // raw "Unique constraint failed on room_propertyId_tier_key".
  test("two rooms with the same name both save, with different codes that never change", async () => {
    const property = await prisma.property.create({
      data: { slug: SLUG, name: "Rooms Test", tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/x.jpg" },
    });
    const room = { propertyId: property.id, name: "Caraway", description: "-", pricePerNight: 120, capacity: 2, bedType: "Queen", images: ["/a.jpg"] };
    const first = await createRoom(room);
    const second = await createRoom(room);
    expect(first.tier).toBe("caraway");
    expect(second.tier).toBe("caraway-2");

    const renamed = await updateRoom({ id: first.id, name: "Caraway Deluxe", tier: "something-else" });
    expect(renamed.tier).toBe("caraway");
  });
});
