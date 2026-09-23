import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  createBooking,
  createRoomBlock,
  deleteRoomBlock,
  getAvailableRooms,
  getRoomOccupancy,
  initiateMobileMoneyPayment,
  isRoomAvailable,
  prisma,
  recordPaynowPaid,
} from "./index";

/**
 * Against the dev database in 2051, where nothing real is booked. Blocks and
 * bookings made here are removed afterwards.
 */
const PREFIX = "blocks-test";
const BY = "blocks-test-staff@example.com";
let roomId: string;
let propertyId: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
  await prisma.roomBlock.deleteMany({ where: { createdBy: BY } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  propertyId = room.propertyId;
  await cleanup();
});
afterAll(cleanup);

const book = (checkIn: string, checkOut: string, n = 1) =>
  createBooking({
    guestName: "Block Test",
    guestEmail: `${PREFIX}-${n}@example.com`,
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });

async function message(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "(did not reject)";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("a room block", () => {
  test("makes its nights unavailable everywhere availability is read", async () => {
    await createRoomBlock({ roomId, from: "2051-01-10", to: "2051-01-15", reason: "Repainting" }, BY);

    expect(await isRoomAvailable(roomId, "2051-01-12", "2051-01-13")).toBe(false);
    const free = await getAvailableRooms("2051-01-12", "2051-01-13", propertyId);
    expect(free.some((room) => room.id === roomId)).toBe(false);
    expect(await message(book("2051-01-14", "2051-01-16"))).toMatch(/not available/);
  });

  test("leaves the boundary mornings bookable, like a stay does", async () => {
    await createRoomBlock({ roomId, from: "2051-02-10", to: "2051-02-12", reason: "Owners visiting" }, BY);
    // Checking out the morning the block starts, and arriving the morning it ends.
    expect(await isRoomAvailable(roomId, "2051-02-08", "2051-02-10")).toBe(true);
    expect(await isRoomAvailable(roomId, "2051-02-12", "2051-02-14")).toBe(true);
  });

  test("shows on the calendar with its reason and who placed it", async () => {
    const occupancy = await getRoomOccupancy(propertyId, { from: "2051-01-01", to: "2051-02-01" });
    const blocks = occupancy.find((room) => room.roomId === roomId)?.blocks ?? [];
    expect(blocks).toContainEqual(
      expect.objectContaining({ from: "2051-01-10", to: "2051-01-15", reason: "Repainting", createdBy: BY }),
    );
  });

  test("is refused over a guest's booking, naming it", async () => {
    const booking = await book("2051-03-10", "2051-03-12", 2);
    const refusal = await message(
      createRoomBlock({ roomId, from: "2051-03-11", to: "2051-03-13", reason: "Plumbing" }, BY),
    );
    expect(refusal).toContain(booking.reference);
  });

  test("is refused over another block", async () => {
    await createRoomBlock({ roomId, from: "2051-04-10", to: "2051-04-12", reason: "Deep clean" }, BY);
    expect(
      await message(createRoomBlock({ roomId, from: "2051-04-11", to: "2051-04-14", reason: "x" }, BY)),
    ).toMatch(/already blocked/);
  });

  test("must end after it starts", async () => {
    expect(
      await message(createRoomBlock({ roomId, from: "2051-05-10", to: "2051-05-10", reason: "x" }, BY)),
    ).toMatch(/end after/);
  });

  test("once removed, its nights can be booked again", async () => {
    const block = await createRoomBlock(
      { roomId, from: "2051-06-10", to: "2051-06-12", reason: "Temporary" },
      BY,
    );
    await deleteRoomBlock(block.id);
    expect(await isRoomAvailable(roomId, "2051-06-10", "2051-06-12")).toBe(true);
  });
});

describe("a lapsed hold whose nights were blocked since", () => {
  test("cannot be revived to pay", async () => {
    const booking = await book("2051-07-10", "2051-07-12", 3);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    await createRoomBlock({ roomId, from: "2051-07-10", to: "2051-07-12", reason: "Roof repair" }, BY);

    expect(await message(initiateMobileMoneyPayment(booking.reference, "0777123456"))).toMatch(/taken/);
  });

  test("is flagged for review, not confirmed, if its payment lands anyway", async () => {
    const booking = await book("2051-08-10", "2051-08-12", 4);
    const lapsed = await prisma.booking.update({
      where: { id: booking.id },
      data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    await createRoomBlock({ roomId, from: "2051-08-10", to: "2051-08-12", reason: "Roof repair" }, BY);

    const after = await recordPaynowPaid(lapsed, "paid");
    expect(after.paymentStatus).toBe("verified");
    expect(after.bookingStatus).toBe("pending");
    expect(after.reviewNote).toContain("staff block (Roof repair)");
  });
});
