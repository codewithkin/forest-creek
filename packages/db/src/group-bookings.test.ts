import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { addDays, allocatePayment, cancelBooking, createGroupBooking, createRoom, createStaffBooking, getGroupBookings, groupReference, lodgeToday, prisma, recordGroupPayment, searchBookings, spreadGroupPrice } from "./index";

describe("group arithmetic", () => {
  test("a reference looks like GRP-XXXXXX, no look-alike letters", () => {
    expect(groupReference()).toMatch(/^GRP-[A-HJ-NP-Z2-9]{6}$/);
  });

  test("an agreed price is spread in proportion and adds up exactly", () => {
    const spread = spreadGroupPrice(
      [
        { calendarSubtotal: 300, nights: 2 },
        { calendarSubtotal: 300, nights: 2 },
        { calendarSubtotal: 600, nights: 2 },
      ],
      1001,
    );
    expect(spread.map((room) => room.total)).toEqual([250, 250, 501]);
    expect(spread.reduce((sum, room) => sum + room.total, 0)).toBe(1001);
    for (const room of spread) expect(room.rate * 2 - room.discount).toBe(room.total);
  });

  test("one payment is shared in proportion, so every room gets money and is secured", () => {
    expect(allocatePayment([500, 500, 200], 1200)).toEqual([500, 500, 200]);
    expect(allocatePayment([500, 500, 200], 600)).toEqual([250, 250, 100]);
    const odd = allocatePayment([333, 333, 334], 100);
    expect(odd.reduce((sum, share) => sum + share, 0)).toBe(100);
    expect(odd.every((share) => share > 0)).toBe(true);
    expect(() => allocatePayment([500, 500], 1001)).toThrow("more than");
  });
});

/** Against the dev database, on a throwaway property. */
const SLUG = "group-bookings-test";
const BY = "groups@example.com";
let rooms: string[] = [];

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { property: { slug: SLUG } } } });
  await prisma.booking.deleteMany({ where: { property: { slug: SLUG } } });
  await prisma.property.deleteMany({ where: { slug: SLUG } });
}

beforeAll(async () => {
  await cleanup();
  const property = await prisma.property.create({
    data: { slug: SLUG, name: "Group House", tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
  });
  for (const name of ["Caraway", "Parsley", "Mint", "Oregon"]) {
    rooms.push((await createRoom({ propertyId: property.id, name, description: "-", pricePerNight: 100, capacity: 2, bedType: "-", images: ["/media/x.jpg"] })).id);
  }
});
afterAll(cleanup);

const today = lodgeToday();

describe("a group booking", () => {
  test("CBZ Trish: four rooms, one agreed price, one $1200 deposit, one reference", async () => {
    const { groupRef, bookings } = await createGroupBooking(
      {
        rooms: rooms.map((roomId) => ({ roomId, guests: 2 })),
        checkIn: addDays(today, 50),
        checkOut: addDays(today, 52),
        guestName: "CBZ Trish",
        source: "phone",
        agreedTotal: 2610,
        rateNote: "Corporate rate",
        payment: { kind: "record", amount: 1200, method: "bank_transfer", note: "CBZ" },
      },
      BY,
    );
    expect(bookings).toHaveLength(4);
    expect(bookings.reduce((sum, booking) => sum + booking.totalAmount, 0)).toBe(2610);
    expect(bookings.reduce((sum, booking) => sum + booking.amountPaid, 0)).toBe(1200);
    expect(new Set(bookings.map((booking) => booking.groupRef))).toEqual(new Set([groupRef]));
    // The deposit lands on every room, so the whole group is secured.
    expect(bookings.every((booking) => booking.amountPaid > 0 && booking.bookingStatus === "confirmed")).toBe(true);
    expect((await searchBookings({ search: groupRef! })).total).toBe(4);
    expect((await getGroupBookings(groupRef!)).map((booking) => booking.roomName)).toEqual(["Caraway", "Mint", "Oregon", "Parsley"]);
  });

  test("if any room is taken, nothing is booked", async () => {
    await createStaffBooking(
      { roomId: rooms[2]!, checkIn: addDays(today, 60), checkOut: addDays(today, 62), guests: 1, guestName: "First", source: "phone", payment: { kind: "arrival" } },
      BY,
    );
    const before = await prisma.booking.count({ where: { roomId: { in: rooms } } });
    const attempt = await createGroupBooking(
      { rooms: rooms.map((roomId) => ({ roomId, guests: 1 })), checkIn: addDays(today, 60), checkOut: addDays(today, 62), guestName: "Too late", source: "phone", payment: { kind: "none" } },
      BY,
    ).then(() => "booked", (error: Error) => error.message);
    expect(attempt).not.toBe("booked");
    expect(await prisma.booking.count({ where: { roomId: { in: rooms } } })).toBe(before);
  });

  test("a deposit above what the group owes is refused before anything is booked", async () => {
    const before = await prisma.booking.count({ where: { roomId: { in: rooms } } });
    const attempt = await createGroupBooking(
      {
        rooms: [{ roomId: rooms[0]!, guests: 1 }],
        checkIn: addDays(today, 70),
        checkOut: addDays(today, 71),
        guestName: "Over",
        source: "phone",
        payment: { kind: "record", amount: 5000, method: "cash", note: "R" },
      },
      BY,
    ).then(() => "booked", (error: Error) => error.message);
    expect(attempt).toContain("more than");
    expect(await prisma.booking.count({ where: { roomId: { in: rooms } } })).toBe(before);
  });
});

describe("paying for a whole group", () => {
  test("one payment is shared over the rooms still owing; a cancelled room takes nothing; never more than is owed", async () => {
    const { groupRef, bookings } = await createGroupBooking(
      {
        rooms: rooms.slice(0, 3).map((roomId) => ({ roomId, guests: 1 })),
        checkIn: addDays(today, 90),
        checkOut: addDays(today, 92),
        guestName: "Pay Later Group",
        source: "phone",
        payment: { kind: "none" },
      },
      BY,
    );
    const ref = groupRef!;
    const cancelled = bookings[2]!;
    await cancelBooking(cancelled.id, BY, "Fewer people");

    const first = await recordGroupPayment({ groupRef: ref, amount: 100, method: "bank_transfer", note: "CBZ 1" }, BY);
    expect(first.recorded.map((room) => room.amount)).toEqual([50, 50]);
    expect(first.refused).toEqual([]);
    expect(first.stillOwed).toBe(300);

    const tooMuch = await recordGroupPayment({ groupRef: ref, amount: 301, method: "cash", note: "x" }, BY).then(() => "recorded", (error: Error) => error.message);
    expect(tooMuch).toContain("Only $300");

    const rest = await recordGroupPayment({ groupRef: ref, amount: "all", method: "cash", note: "Front desk" }, BY);
    expect([rest.amount, rest.stillOwed]).toEqual([300, 0]);
    const after = await getGroupBookings(ref);
    expect(after.filter((room) => room.id !== cancelled.id).every((room) => room.amountPaid === room.totalAmount && room.paymentStatus === "verified")).toBe(true);
    expect(after.find((room) => room.id === cancelled.id)!.amountPaid).toBe(0);
    expect(await prisma.receipt.count({ where: { booking: { groupRef: ref } } })).toBe(4);

    const again = await recordGroupPayment({ groupRef: ref, amount: 10, method: "cash", note: "x" }, BY).then(() => "recorded", (error: Error) => error.message);
    expect(again).toContain("already paid");
  });
});
