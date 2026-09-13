import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { buildGuestContext, createBookingTool, requestPaymentTool } from "@forest-creek/ai";
import { getPropertyBySlug, getRooms, prisma } from "@forest-creek/db";

const GUEST_PHONE = "+263700000001";
const TEST_EMAIL = "wa-tools-test@example.com";
// Mastra calls a tool with (input, { requestContext, ... }) — mirror that shape
// exactly, or the test proves nothing about how the tool runs in production.
const context = { requestContext: buildGuestContext({ phone: GUEST_PHONE, channel: "whatsapp" }) };

const run = (tool: typeof createBookingTool | typeof requestPaymentTool, input: unknown) =>
  (tool.execute as (i: unknown, c: unknown) => Promise<Record<string, unknown>>)(input, context);

let propertySlug: string;
let familyTier: string;
let familyCapacity: number;
let familyRate: number;

async function cleanup() {
  await prisma.booking.deleteMany({ where: { guestEmail: TEST_EMAIL } });
}

beforeAll(async () => {
  const property = await getPropertyBySlug("forest-creek");
  if (!property) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  propertySlug = property.slug;

  const rooms = await getRooms(property.id);
  const family = rooms.find((room) => room.capacity >= 3) ?? rooms[0]!;
  familyTier = family.tier;
  familyCapacity = family.capacity;
  familyRate = family.pricePerNight;

  await cleanup();
});

afterAll(cleanup);

describe("create-booking", () => {
  test("creates a real booking stamped to the whatsapp channel", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2031-04-10",
      checkOut: "2031-04-13",
      guests: 2,
      guestName: "Tool Test Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "bank_transfer",
    });

    expect(result.ok).toBe(true);
    expect(result.reference).toMatch(/^FC-[A-Z2-9]{6}$/);
    expect(result.nights).toBe(3);
    expect(result.totalAmountUsd).toBe(familyRate * 3);
    expect(result.bookingStatus).toBe("pending");
    expect(result.paymentStatus).toBe("pending");

    const stored = await prisma.booking.findUnique({
      where: { reference: result.reference as string },
    });
    expect(stored?.channel).toBe("whatsapp");
    // The number came from the request context, never from the model.
    expect(stored?.guestPhone).toBe(GUEST_PHONE);
  });

  test("refuses dates that clash with the booking above", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2031-04-12",
      checkOut: "2031-04-15",
      guests: 2,
      guestName: "Clashing Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ROOM_UNAVAILABLE");
  });

  test("allows a stay starting the day the previous guest leaves", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2031-04-13",
      checkOut: "2031-04-15",
      guests: 2,
      guestName: "Turnover Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });

    expect(result.ok).toBe(true);
  });

  test("refuses more guests than the room sleeps", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2032-01-05",
      checkOut: "2032-01-07",
      guests: familyCapacity + 5,
      guestName: "Too Many",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("OVER_CAPACITY");
  });

  test("refuses an invented property instead of guessing one", async () => {
    const result = await run(createBookingTool, {
      propertySlug: "chateau-imaginaire",
      roomTier: familyTier,
      checkIn: "2032-02-01",
      checkOut: "2032-02-03",
      guests: 2,
      guestName: "Ghost",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("chateau-imaginaire");
  });

  test("refuses an invented room and names the real ones", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: "penthouse-that-does-not-exist",
      checkIn: "2032-02-01",
      checkOut: "2032-02-03",
      guests: 2,
      guestName: "Ghost",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
  });

  test("refuses an invented experience rather than silently dropping it", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2032-03-01",
      checkOut: "2032-03-03",
      guests: 2,
      guestName: "Ghost",
      guestEmail: TEST_EMAIL,
      activitySlugs: ["hot-air-balloon"],
      paymentMethod: "card",
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("Unknown experience");
  });

  test("prices experiences on top of the room", async () => {
    const property = await getPropertyBySlug(propertySlug);
    const activities = await prisma.activity.findMany({
      where: { propertyId: property!.id, active: true },
      orderBy: { sortOrder: "asc" },
      take: 2,
    });

    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2032-05-01",
      checkOut: "2032-05-03",
      guests: 2,
      guestName: "Experience Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: activities.map((activity) => activity.slug),
      paymentMethod: "card",
    });

    const experienceTotal = activities.reduce((sum, activity) => sum + activity.price, 0);
    expect(result.ok).toBe(true);
    expect(result.subtotalUsd).toBe(familyRate * 2);
    expect(result.totalAmountUsd).toBe(familyRate * 2 + experienceTotal);
    expect(result.activities).toHaveLength(activities.length);
  });
});

describe("request-payment", () => {
  test("issues instructions and records that payment was asked for", async () => {
    const created = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-06-01",
      checkOut: "2033-06-03",
      guests: 2,
      guestName: "Payment Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "bank_transfer",
    });
    const reference = created.reference as string;

    const before = await prisma.booking.findUnique({ where: { reference } });
    expect(before?.paymentRequestedAt).toBeNull();

    const payment = await run(requestPaymentTool, { reference });
    expect(payment.ok).toBe(true);
    expect(payment.reference).toBe(reference);
    expect(payment.amountUsd).toBe(created.totalAmountUsd);
    expect(typeof payment.instructions).toBe("string");
    expect((payment.instructions as string).length).toBeGreaterThan(0);

    const after = await prisma.booking.findUnique({ where: { reference } });
    expect(after?.paymentRequestedAt).toBeInstanceOf(Date);
    // Requesting payment must not confirm anything on its own.
    expect(after?.paymentStatus).toBe("pending");
    expect(after?.bookingStatus).toBe("pending");
  });

  test("is accepted in lower case, as a guest would type it", async () => {
    const created = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-07-01",
      checkOut: "2033-07-03",
      guests: 2,
      guestName: "Lowercase Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });

    const payment = await run(requestPaymentTool, {
      reference: (created.reference as string).toLowerCase(),
    });
    expect(payment.ok).toBe(true);
  });

  test("reports an unknown reference instead of throwing", async () => {
    const payment = await run(requestPaymentTool, { reference: "FC-ZZZZZZ" });
    expect(payment.ok).toBe(false);
    expect(payment.code).toBe("BOOKING_NOT_FOUND");
  });

  test("refuses to re-bill a booking already paid", async () => {
    const created = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-08-01",
      checkOut: "2033-08-03",
      guests: 2,
      guestName: "Paid Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });
    const reference = created.reference as string;

    await prisma.booking.update({
      where: { reference },
      data: { paymentStatus: "verified", bookingStatus: "confirmed" },
    });

    const payment = await run(requestPaymentTool, { reference });
    expect(payment.ok).toBe(false);
    expect(payment.code).toBe("ALREADY_PAID");
  });

  test("refuses to bill a cancelled booking", async () => {
    const created = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-09-01",
      checkOut: "2033-09-03",
      guests: 2,
      guestName: "Cancelled Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "card",
    });
    const reference = created.reference as string;

    await prisma.booking.update({ where: { reference }, data: { bookingStatus: "cancelled" } });

    const payment = await run(requestPaymentTool, { reference });
    expect(payment.ok).toBe(false);
    expect(payment.code).toBe("BOOKING_CANCELLED");
  });
});
