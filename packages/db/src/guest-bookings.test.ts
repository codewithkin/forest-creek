import { afterAll, beforeAll, expect, test } from "bun:test";

import { createBooking, listGuestBookings, prisma } from "./index";

/** A guest's own bookings, found by the phone they message from. */
const PREFIX = "guest-bookings-test";
const PHONE = "263770000941";
let roomId: string;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  await cleanup();
});
afterAll(cleanup);

const book = (checkIn: string, checkOut: string, guestPhone: string | undefined, n: number) =>
  createBooking({
    guestName: "Guest Bookings",
    guestEmail: `${PREFIX}-${n}@example.com`,
    guestPhone,
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "whatsapp",
  });

test("lists this phone's bookings, newest first, and nobody else's", async () => {
  const first = await book("2054-02-01", "2054-02-03", PHONE, 1);
  const second = await book("2054-03-01", "2054-03-02", PHONE, 2);
  await book("2054-04-01", "2054-04-02", "263770000942", 3);

  const mine = await listGuestBookings({ guestPhone: PHONE });
  expect(mine.map((booking) => booking.reference)).toEqual([second.reference, first.reference]);
});

test("leaves out stays that ended more than 30 days ago", async () => {
  const past = await book("2054-05-01", "2054-05-03", PHONE, 4);
  // Seen from 31 days after checkout, that stay is history.
  expect((await listGuestBookings({ guestPhone: PHONE }, "2054-06-03")).some((b) => b.reference === past.reference)).toBe(false);
  expect((await listGuestBookings({ guestPhone: PHONE }, "2054-06-02")).some((b) => b.reference === past.reference)).toBe(true);
});

test("a website guest, who has no phone to be known by, is found by the chat they booked in", async () => {
  const chat = await createBooking({
    guestName: "Guest Bookings", guestEmail: `${PREFIX}-web@example.com`, roomId,
    checkIn: "2054-07-01", checkOut: "2054-07-02", guests: 1, activityIds: [],
    paymentMethod: "ecocash", channel: "web", chatSessionId: "web-chat-guest-bookings-test",
  });
  expect((await listGuestBookings({ chatSessionId: "web-chat-guest-bookings-test" })).map((b) => b.reference)).toEqual([chat.reference]);
  // Knowing nobody finds nothing, never everyone.
  expect(await listGuestBookings({})).toEqual([]);
});
