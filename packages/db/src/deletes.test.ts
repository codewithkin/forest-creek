import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  createActivity,
  createBooking,
  createDayVisit,
  createRoom,
  createRoomBlock,
  deleteProperty,
  deleteRoom,
  prisma,
  requestDayVisit,
} from "./index";

/**
 * Deleting what staff added: a throwaway property per test, never the seeded
 * ones. Deletes are refused once a guest's booking hangs off the thing.
 */
const PREFIX = "deletes-test";
const EMAIL = `${PREFIX}@example.com`;
const BY = `${PREFIX}-staff@example.com`;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.dayVisitBooking.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.user.deleteMany({ where: { email: BY } });
  await prisma.property.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

beforeEach(cleanup);
afterAll(cleanup);

async function propertyWithRoom(slug = PREFIX) {
  const property = await prisma.property.create({
    data: {
      slug, name: "Mistake House", tagline: "-", description: "-", location: "-", phone: "-",
      email: "mistake@example.com", heroImage: "/media/x.jpg",
    },
  });
  const room = await createRoom({
    propertyId: property.id, tier: "twin", name: "Twin", description: "-",
    pricePerNight: 100, capacity: 2, bedType: "Twin", images: ["/media/x.jpg"],
  });
  return { property, room };
}

const book = (roomId: string) =>
  createBooking({
    guestName: "Delete Test", guestEmail: EMAIL, roomId,
    checkIn: "2052-03-01", checkOut: "2052-03-03", guests: 1,
    activityIds: [], paymentMethod: "ecocash", channel: "web",
  });

async function message(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "(did not reject)";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("deleteRoom", () => {
  test("removes a room nobody booked, and its blocked dates with it", async () => {
    const { room } = await propertyWithRoom();
    await createRoomBlock({ roomId: room.id, from: "2052-01-01", to: "2052-01-05", reason: PREFIX }, BY);

    expect(await deleteRoom(room.id)).toEqual({ id: room.id });
    expect(await prisma.room.findUnique({ where: { id: room.id } })).toBeNull();
    expect(await prisma.roomBlock.count({ where: { roomId: room.id } })).toBe(0);
  });

  test("refuses once a booking used the room, naming it, and keeps both", async () => {
    const { room } = await propertyWithRoom();
    const booking = await book(room.id);
    await prisma.booking.update({ where: { id: booking.id }, data: { bookingStatus: "cancelled" } });

    expect(await message(deleteRoom(room.id))).toContain(`Booking ${booking.reference}`);
    expect(await prisma.room.findUnique({ where: { id: room.id } })).not.toBeNull();
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.roomId).toBe(room.id);
  });
});

describe("deleteProperty", () => {
  test("removes a property added by mistake with everything staff put under it", async () => {
    const { property, room } = await propertyWithRoom();
    await createActivity({ propertyId: property.id, slug: "walk", name: "Walk", description: "-", price: 0, images: ["/media/x.jpg"] });
    await createDayVisit({ propertyId: property.id, slug: "day", name: "Day", description: "-" });
    await createRoomBlock({ roomId: room.id, from: "2052-01-01", to: "2052-01-05", reason: PREFIX }, BY);
    const manager = await prisma.user.create({ data: { id: `${PREFIX}-manager`, name: "M", email: BY, role: "manager" } });
    await prisma.staffProperty.create({ data: { userId: manager.id, propertyId: property.id } });

    expect(await deleteProperty(property.id)).toEqual({ id: property.id });
    expect(await prisma.property.findUnique({ where: { id: property.id } })).toBeNull();
    expect(await prisma.room.count({ where: { propertyId: property.id } })).toBe(0);
    expect(await prisma.activity.count({ where: { propertyId: property.id } })).toBe(0);
    expect(await prisma.dayVisit.count({ where: { propertyId: property.id } })).toBe(0);
    expect(await prisma.staffProperty.count({ where: { propertyId: property.id } })).toBe(0);
    // The manager's account survives; only their link to the property goes.
    expect(await prisma.user.findUnique({ where: { id: manager.id } })).not.toBeNull();
  });

  test("refuses once a guest booked a stay there", async () => {
    const { property, room } = await propertyWithRoom();
    const booking = await book(room.id);

    expect(await message(deleteProperty(property.id))).toContain(`Booking ${booking.reference}`);
    expect(await prisma.property.findUnique({ where: { id: property.id } })).not.toBeNull();
  });

  test("refuses once a guest asked for a day visit there", async () => {
    const { property } = await propertyWithRoom();
    const visit = await createDayVisit({ propertyId: property.id, slug: "day", name: "Day", description: "-" });
    const asked = await requestDayVisit({
      dayVisitId: visit.id, visitDate: "2052-03-01", guests: 2,
      guestName: "Delete Test", guestEmail: EMAIL, guestPhone: "0771234567",
    }, new Date("2052-02-01T08:00:00Z"));

    expect(await message(deleteProperty(property.id))).toContain(`Day visit ${asked.reference}`);
    expect(await prisma.dayVisit.findUnique({ where: { id: visit.id } })).not.toBeNull();
  });
});
