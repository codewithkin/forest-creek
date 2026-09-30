import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createBooking, createRoom, prisma } from "@forest-creek/db";

import { t } from "../index";
import { propertiesRouter } from "./properties";

/**
 * Deleting and editing what staff added: the owner deletes properties, a
 * manager touches only their own property's rooms, and anything a guest has
 * booked is refused as a conflict.
 */
const PREFIX = "api-properties-test";
const EMAIL = `${PREFIX}@example.com`;
const createCaller = t.createCallerFactory(propertiesRouter);

type Role = "admin" | "manager" | "guest";
const callerAs = (id: string, role: Role) =>
  createCaller({
    session: { user: { id, role, email: `${id}@example.com` } },
  } as unknown as Parameters<typeof createCaller>[0]);

const managerId = `${PREFIX}-manager`;
const owner = () => callerAs("owner", "admin");
const manager = () => callerAs(managerId, "manager");

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: EMAIL } });
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.property.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

async function property(slug: string) {
  return prisma.property.create({
    data: {
      slug, name: slug, tagline: "-", description: "-", location: "-", phone: "-",
      email: "x@example.com", heroImage: "/media/x.jpg",
    },
  });
}

let rooms = 0;
const room = (propertyId: string) =>
  createRoom({
    propertyId, tier: `twin-${++rooms}`, name: "Twin", description: "-",
    pricePerNight: 100, capacity: 2, bedType: "Twin", images: ["/media/x.jpg"],
  });

let theirs: string;
let managersOwn: string;

beforeAll(async () => {
  await cleanup();
  theirs = (await property(`${PREFIX}-theirs`)).id;
  managersOwn = (await property(`${PREFIX}-own`)).id;
  await prisma.user.create({
    data: { id: managerId, name: "Manager", email: `${managerId}@example.com`, role: "manager" },
  });
  await prisma.staffProperty.create({ data: { userId: managerId, propertyId: managersOwn } });
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

describe("rooms", () => {
  test("a manager cannot hide, edit or delete another property's room by its id", async () => {
    const other = await room(theirs);
    expect(await code(manager().setRoomActive({ id: other.id, active: false }))).toBe("FORBIDDEN");
    expect(await code(manager().updateRoom({ id: other.id, pricePerNight: 1 }))).toBe("FORBIDDEN");
    expect(await code(manager().removeRoom({ id: other.id }))).toBe("FORBIDDEN");

    const untouched = await prisma.room.findUnique({ where: { id: other.id } });
    expect(untouched).toMatchObject({ active: true, pricePerNight: 100 });
  });

  test("a manager deletes a room of their own", async () => {
    const own = await room(managersOwn);
    expect(await code(manager().removeRoom({ id: own.id }))).toBe("OK");
    expect(await prisma.room.findUnique({ where: { id: own.id } })).toBeNull();
  });

  test("a booked room is a conflict, with the booking named", async () => {
    const booked = await room(theirs);
    const booking = await createBooking({
      guestName: "Api Test", guestEmail: EMAIL, roomId: booked.id,
      checkIn: "2053-05-01", checkOut: "2053-05-02", guests: 1,
      activityIds: [], paymentMethod: "ecocash", channel: "web",
    });
    const refusal = await owner().removeRoom({ id: booked.id }).catch((error) => error);
    expect(refusal.code).toBe("CONFLICT");
    expect(refusal.message).toContain(booking.reference);
    expect(await code(owner().remove({ id: theirs }))).toBe("CONFLICT");
  });

  test("an unknown room is not found", async () => {
    expect(await code(owner().removeRoom({ id: "no-such-room" }))).toBe("NOT_FOUND");
  });
});

describe("properties", () => {
  test("only the owner deletes a property, even the manager's own", async () => {
    expect(await code(manager().remove({ id: managersOwn }))).toBe("FORBIDDEN");

    const mistake = await property(`${PREFIX}-mistake`);
    expect(await code(owner().remove({ id: mistake.id }))).toBe("OK");
    expect(await prisma.property.findUnique({ where: { id: mistake.id } })).toBeNull();
    expect(await code(owner().remove({ id: mistake.id }))).toBe("NOT_FOUND");
  });
});
