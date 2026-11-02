import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  autoCheckOutPastStays,
  changeBookingExperiences,
  checkInBooking,
  checkOutBooking,
  createBooking,
  createRoom,
  createStaffBooking,
  getBookingEvents,
  getBookingNotifications,
  getRoomOccupancy,
  getTodayStays,
  isRoomAvailable,
  lodgeToday,
  moveBookingRoom,
  prisma,
  searchBookings,
  undoCheckIn,
  updateBookingDetails,
} from "./index";

/** Staff bookings, against the dev database on a throwaway property, years ahead. */
const SLUG = "staff-bookings-test";
const EMAIL = "staff-bookings-test@example.com";
const BY = "manager@example.com";
let propertyId: string;
let roomId: string;
let otherRoomId: string;
let tinyRoomId: string;
let activityId: string;

async function cleanup() {
  const bookings = await prisma.booking.findMany({ where: { property: { slug: SLUG } }, select: { id: true } });
  await prisma.paymentEvent.deleteMany({ where: { bookingId: { in: bookings.map((booking) => booking.id) } } });
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: {
      slug: SLUG, name: "Staff House", tagline: "-", description: "-", location: "-", phone: "-",
      email: "staff-house@example.com", heroImage: "/media/x.jpg", sortOrder: 999,
    },
  });
  propertyId = property.id;
  const room = (name: string, capacity: number) =>
    createRoom({ propertyId, name, description: "-", pricePerNight: 100, capacity, bedType: "-", images: ["/media/x.jpg"] });
  roomId = (await room("Suite", 4)).id;
  otherRoomId = (await room("Cottage", 4)).id;
  tinyRoomId = (await room("Nook", 1)).id;
  activityId = (
    await prisma.activity.create({
      data: { propertyId, slug: "braai", name: "Braai", description: "-", price: 30, image: "/media/x.jpg" },
    })
  ).id;
});
afterAll(cleanup);

const manual = (checkIn: string, checkOut: string, payment: Parameters<typeof createStaffBooking>[0]["payment"], extra = {}) =>
  createStaffBooking(
    { roomId, checkIn, checkOut, guests: 2, guestName: "Walk In", guestEmail: EMAIL, source: "walk-in", payment, ...extra },
    BY,
  );

const message = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "(did not reject)";
};

describe("a booking taken by staff", () => {
  test("with cash in hand: confirmed, receipted, on the books, and the room is taken", async () => {
    const booking = await manual("2071-01-10", "2071-01-12", { kind: "record", amount: 200, method: "cash", note: "Receipt book 12" });
    expect(booking).toMatchObject({ channel: "staff", source: "walk-in", createdBy: BY, bookingStatus: "confirmed", paymentStatus: "verified", amountPaid: 200 });
    expect(await isRoomAvailable(roomId, "2071-01-10", "2071-01-12")).toBe(false);
    expect(await prisma.receipt.count({ where: { bookingId: booking.id } })).toBe(1);
    const history = await getBookingEvents(booking.id);
    expect(history.map((event) => event.kind).sort()).toEqual(["created", "payment"]);
    expect(history.every((event) => event.actor === BY)).toBe(true);
  });

  test("left unpaid: a maybe that holds nothing and sends no email", async () => {
    const booking = await manual("2071-02-10", "2071-02-12", { kind: "none" });
    expect(booking.bookingStatus).toBe("pending");
    expect(await isRoomAvailable(roomId, "2071-02-10", "2071-02-12")).toBe(true);
    expect(await getBookingNotifications(booking.id)).toEqual([]);
    const occupancy = await getRoomOccupancy(propertyId, { from: "2071-02-01", to: "2071-03-01" });
    expect(occupancy.find((room) => room.roomId === roomId)?.maybes.map((stay) => stay.reference)).toEqual([booking.reference]);
  });

  test("pay on arrival: confirmed by staff, taking the room with no money in", async () => {
    const booking = await manual("2071-03-10", "2071-03-12", { kind: "arrival" });
    expect(booking).toMatchObject({ bookingStatus: "confirmed", amountPaid: 0 });
    expect(await isRoomAvailable(roomId, "2071-03-10", "2071-03-12")).toBe(false);
    const emails = await getBookingNotifications(booking.id);
    expect(emails.map((email) => email.event)).toEqual(["reserved"]);
  });

  test("still can't double-sell a secured room, even all at once", async () => {
    await manual("2071-04-10", "2071-04-12", { kind: "arrival" });
    expect(await message(manual("2071-04-11", "2071-04-13", { kind: "arrival" }))).toContain("already booked");
    const race = await Promise.allSettled(
      [1, 2, 3].map((index) =>
        manual("2071-05-10", "2071-05-12", { kind: "record", amount: 200, method: "cash", note: `Attempt ${index}` }),
      ),
    );
    expect(race.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
  });

  test("an agreed rate needs a reason, and is what's charged", async () => {
    expect(await message(manual("2071-06-10", "2071-06-12", { kind: "none" }, { agreedRate: 70 }))).toContain("Say why");
    const booking = await manual("2071-06-10", "2071-06-12", { kind: "none" }, { agreedRate: 70, rateNote: "Returning guest" });
    expect(booking).toMatchObject({ subtotal: 140, totalAmount: 140, roomRate: 70, nightlyRates: [70, 70], rateNote: "Returning guest" });
  });

  test("a walk-in with no email gets no guest email, and a pay link is refused", async () => {
    const booking = await manual("2071-07-10", "2071-07-12", { kind: "arrival" }, { guestEmail: "" });
    expect((await getBookingNotifications(booking.id)).filter((email) => email.audience === "guest")).toEqual([]);
    expect(await message(manual("2071-07-20", "2071-07-22", { kind: "link" }, { guestEmail: "" }))).toContain("email");
  });

  test("can be entered after the stay began; a guest's own booking can't", async () => {
    const last = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const next = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10);
    expect((await manual(last, next, { kind: "arrival" })).channel).toBe("staff");
    expect(
      await message(
        createBooking({
          guestName: "G", guestEmail: EMAIL, roomId, checkIn: last, checkOut: next, guests: 1,
          activityIds: [], paymentMethod: "ecocash", channel: "web",
        }),
      ),
    ).toContain("past");
  });
});

describe("a guest's own booking can't claim to be staff", () => {
  test("the public schema refuses the staff and quote channels", async () => {
    for (const channel of ["staff", "quote"]) {
      const attempt = createBooking({
        guestName: "G", guestEmail: EMAIL, roomId, checkIn: "2071-08-10", checkOut: "2071-08-12", guests: 1,
        activityIds: [], paymentMethod: "ecocash", channel: channel as "web",
      });
      expect(await message(attempt)).not.toBe("(did not reject)");
    }
  });
});

describe("changing a booking", () => {
  test("corrects guest details, keeps guest data out of the history, and respects capacity", async () => {
    const booking = await manual("2071-09-10", "2071-09-12", { kind: "none" });
    const updated = await updateBookingDetails({ id: booking.id, guestName: "Tariro Moyo", guests: 3 }, BY);
    expect(updated).toMatchObject({ guestName: "Tariro Moyo", guests: 3 });
    const line = (await getBookingEvents(booking.id))[0]!;
    expect(line.detail).toBe("Changed name, guests");
    expect(await message(updateBookingDetails({ id: booking.id, guests: 9 }, BY))).toContain("sleeps 4");
  });

  test("moves a stay to a free room at the same price, and never onto a taken one", async () => {
    const booking = await manual("2071-10-10", "2071-10-12", { kind: "arrival" }, { agreedRate: 80, rateNote: "Long-standing guest" });
    const moved = await moveBookingRoom({ id: booking.id, roomId: otherRoomId }, BY);
    expect(moved).toMatchObject({ roomId: otherRoomId, roomName: "Cottage", totalAmount: 160 });
    expect(await isRoomAvailable(roomId, "2071-10-10", "2071-10-12")).toBe(true);

    const blocker = await manual("2071-11-10", "2071-11-12", { kind: "arrival" });
    const other = await createStaffBooking(
      { roomId: otherRoomId, checkIn: "2071-11-10", checkOut: "2071-11-12", guests: 2, guestName: "B", source: "phone", payment: { kind: "arrival" } },
      BY,
    );
    expect(await message(moveBookingRoom({ id: other.id, roomId }, BY))).toContain(blocker.reference);
    expect(await message(moveBookingRoom({ id: other.id, roomId: tinyRoomId }, BY))).toContain("sleeps 1");
  });

  test("experiences move the total and deposit, but never below what's paid", async () => {
    const booking = await manual("2071-12-10", "2071-12-12", { kind: "none" });
    const added = await changeBookingExperiences({ id: booking.id, activityIds: [activityId] }, BY);
    expect(added).toMatchObject({ totalAmount: 230, activityNames: ["Braai"], depositAmount: 115 });
    const removed = await changeBookingExperiences({ id: booking.id, activityIds: [] }, BY);
    expect(removed).toMatchObject({ totalAmount: 200, activityNames: [] });

    const paid = await manual("2072-01-10", "2072-01-12", { kind: "record", amount: 200, method: "cash", note: "Paid" }, { activityIds: [] });
    const owed = await changeBookingExperiences({ id: paid.id, activityIds: [activityId] }, BY);
    expect(owed).toMatchObject({ totalAmount: 230, paymentStatus: "partial" });
    await prisma.booking.update({ where: { id: paid.id }, data: { amountPaid: 230, paymentStatus: "verified" } });
    expect(await message(changeBookingExperiences({ id: paid.id, activityIds: [] }, BY))).toContain("below");
  });
});

describe("the stay itself", () => {
  const dayFromToday = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  test("checks in and out once, and refuses the wrong moment", async () => {
    const today = lodgeToday();
    const booking = await manual(today, dayFromToday(2), { kind: "arrival" });
    const stays = await getTodayStays(today, [propertyId]);
    expect(stays.arrivals.map((stay) => stay.id)).toContain(booking.id);

    expect(await message(checkOutBooking(booking.id, BY))).toContain("hasn't checked in");
    const checkedIn = await checkInBooking(booking.id, BY);
    expect(checkedIn.checkedInAt).not.toBeNull();
    await checkInBooking(booking.id, BY);
    expect((await getBookingEvents(booking.id)).filter((event) => event.kind === "check-in")).toHaveLength(1);
    expect((await getTodayStays(today, [propertyId])).inHouse.map((stay) => stay.id)).toContain(booking.id);

    await undoCheckIn(booking.id, BY);
    await checkInBooking(booking.id, BY);
    await checkOutBooking(booking.id, BY);
    expect(await message(undoCheckIn(booking.id, BY))).toContain("already checked out");
  });

  test("an unpaid booking or a future arrival can't check in", async () => {
    const unpaid = await manual(lodgeToday(), dayFromToday(1), { kind: "none" }, { roomId: otherRoomId });
    expect(await message(checkInBooking(unpaid.id, BY))).toContain("isn't paid");
    const later = await manual("2072-02-10", "2072-02-12", { kind: "arrival" });
    expect(await message(checkInBooking(later.id, BY))).toContain("arrives on");
  });

  test("the sweeper checks out finished stays, marked as automatic", async () => {
    const booking = await manual(dayFromToday(-3), dayFromToday(-1), { kind: "arrival" }, { roomId: tinyRoomId, guests: 1 });
    await checkInBooking(booking.id, BY);
    expect(await autoCheckOutPastStays()).toBeGreaterThanOrEqual(1);
    const line = (await getBookingEvents(booking.id)).find((event) => event.kind === "check-out")!;
    expect(line.actor).toBe("system");
    expect(await autoCheckOutPastStays()).toBe(0);
  });
});

describe("searchBookings", () => {
  test("finds by reference, name or phone, pages, and stays in scope", async () => {
    const booking = await manual("2072-03-10", "2072-03-12", { kind: "none" }, { guestName: "Rutendo Searchable", guestPhone: "+263771112223" });
    for (const search of [booking.reference.toLowerCase(), "searchable", "1112223"]) {
      const found = await searchBookings({ search, propertyIds: [propertyId] });
      expect(found.rows.map((row) => row.id)).toEqual([booking.id]);
    }
    expect((await searchBookings({ search: "searchable", propertyIds: ["someone-else"] })).total).toBe(0);
    const paged = await searchBookings({ propertyIds: [propertyId], pageSize: 2, page: 1 });
    expect(paged.rows).toHaveLength(2);
    expect(paged.pages).toBeGreaterThan(1);
  });
});
