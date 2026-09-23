import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  buildGuestContext,
  checkPaymentStatusTool,
  createBookingTool,
  requestPaymentTool,
} from "@forest-creek/ai";
import { getPropertyBySlug, getRooms, prisma } from "@forest-creek/db";

const GUEST_PHONE = "+263700000001";
const TEST_EMAIL = "wa-tools-test@example.com";
const MOBILE_MONEY_NUMBER = "0777123456";

let turns = 0;
/** Each agent run is one guest message, so each gets its own turn id. */
const nextTurn = () => `test-turn-${++turns}`;

type AnyTool = typeof createBookingTool | typeof requestPaymentTool | typeof checkPaymentStatusTool;

// Mastra calls a tool with (input, { requestContext, ... }) — mirror that shape
// exactly, or the test proves nothing about how the tool runs in production.
const run = (tool: AnyTool, input: unknown, turnId = nextTurn()) =>
  (tool.execute as (i: unknown, c: unknown) => Promise<Record<string, unknown>>)(input, {
    requestContext: buildGuestContext({ phone: GUEST_PHONE, channel: "whatsapp", turnId }),
  });

/** A booking as a guest makes one: read back in one turn, confirmed in the next. */
async function book(input: Record<string, unknown>) {
  const readBack = await run(createBookingTool, input);
  expect(readBack.needsConfirmation).toBe(true);
  return run(createBookingTool, input);
}

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

describe("create-booking confirmation", () => {
  test("the first call books nothing and reads the stay back with its total", async () => {
    const input = {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2034-01-10",
      checkOut: "2034-01-12",
      guests: 2,
      guestName: "Read Back Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    };
    const result = await run(createBookingTool, input);

    expect(result.ok).toBe(false);
    expect(result.needsConfirmation).toBe(true);
    const readBack = result.readBack as Record<string, unknown>;
    expect(readBack.nights).toBe(2);
    expect(readBack.totalAmountUsd).toBe(familyRate * 2);
    // The policy: half now, the rest 14 days before arrival, and the guest is shown where it is written.
    expect(readBack.dueNowUsd).toBe(Math.ceil((familyRate * 2) / 2));
    expect(readBack.balanceDueDate).toBe("2033-12-27");
    expect(String(readBack.policyUrl)).toContain("/policies");
    expect(String(result.howToReply)).toContain("Booking & Cancellation Policy");
    expect(await prisma.booking.count({ where: { guestName: "Read Back Guest" } })).toBe(0);
  });

  test("calling again in the same turn still books nothing — the guest has not replied", async () => {
    const input = {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2034-02-10",
      checkOut: "2034-02-12",
      guests: 2,
      guestName: "Same Turn Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "onemoney",
    };
    const turn = nextTurn();
    await run(createBookingTool, input, turn);
    const again = await run(createBookingTool, input, turn);

    expect(again.needsConfirmation).toBe(true);
    expect(await prisma.booking.count({ where: { guestName: "Same Turn Guest" } })).toBe(0);
  });
});

describe("create-booking", () => {
  test("creates a real booking stamped to the whatsapp channel", async () => {
    const result = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2031-04-10",
      checkOut: "2031-04-13",
      guests: 2,
      guestName: "Tool Test Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    });

    expect(result.ok).toBe(true);
    expect(result.reference).toMatch(/^FC-[A-Z2-9]{6}$/);
    expect(result.nights).toBe(3);
    expect(result.totalAmountUsd).toBe(familyRate * 3);
    expect(result.bookingStatus).toBe("pending");
    expect(result.paymentStatus).toBe("pending");
    expect(result.dueNowUsd).toBe(Math.ceil((familyRate * 3) / 2));
    expect(result.balanceDueDate).toBe("2031-03-27");

    const stored = await prisma.booking.findUnique({
      where: { reference: result.reference as string },
    });
    expect(stored?.channel).toBe("whatsapp");
    // The number came from the request context, never from the model.
    expect(stored?.guestPhone).toBe(GUEST_PHONE);
  });

  test("refuses dates that clash with the booking above", async () => {
    const result = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2031-04-12",
      checkOut: "2031-04-15",
      guests: 2,
      guestName: "Clashing Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "onemoney",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("ROOM_UNAVAILABLE");
  });

  test("allows a stay starting the day the previous guest leaves", async () => {
    const result = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2031-04-13",
      checkOut: "2031-04-15",
      guests: 2,
      guestName: "Turnover Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    });

    expect(result.ok).toBe(true);
  });

  test("refuses more guests than the room sleeps, before any read-back", async () => {
    const result = await run(createBookingTool, {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2032-01-05",
      checkOut: "2032-01-07",
      guests: familyCapacity + 5,
      guestName: "Too Many",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    });

    expect(result.ok).toBe(false);
    expect(result.needsConfirmation).toBeUndefined();
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
      paymentMethod: "ecocash",
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
      paymentMethod: "ecocash",
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
      paymentMethod: "ecocash",
    });

    expect(result.ok).toBe(false);
    expect(String(result.error)).toContain("Unknown experience");
  });

  test("prices experiences on top of the room, and the read-back matches the booking", async () => {
    const property = await getPropertyBySlug(propertySlug);
    const activities = await prisma.activity.findMany({
      where: { propertyId: property!.id, active: true },
      orderBy: { sortOrder: "asc" },
      take: 2,
    });
    const input = {
      propertySlug,
      roomTier: familyTier,
      checkIn: "2032-05-01",
      checkOut: "2032-05-03",
      guests: 2,
      guestName: "Experience Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: activities.map((activity) => activity.slug),
      paymentMethod: "ecocash",
    };

    const readBack = await run(createBookingTool, input);
    const result = await run(createBookingTool, input);

    const experienceTotal = activities.reduce((sum, activity) => sum + activity.price, 0);
    expect(result.ok).toBe(true);
    expect(result.subtotalUsd).toBe(familyRate * 2);
    expect(result.totalAmountUsd).toBe(familyRate * 2 + experienceTotal);
    expect((readBack.readBack as Record<string, unknown>).totalAmountUsd).toBe(result.totalAmountUsd);
    expect(result.activities).toHaveLength(activities.length);
  });
});

// Paynow is unconfigured in this environment (PAYNOW_INTEGRATION_ID/KEY are
// unset), so these exercise the guard checks that run before that — the same
// checks that guarded the old manual-payment flow — plus what happens once a
// real charge is genuinely not available. A live Paynow sandbox key would let
// a follow-up test cover an actual initiate + poll, which nothing here can.
describe("request-payment", () => {
  test("reports mobile money as not set up, and leaves the booking untouched", async () => {
    const created = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-06-01",
      checkOut: "2033-06-03",
      guests: 2,
      guestName: "Payment Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    });
    const reference = created.reference as string;

    const before = await prisma.booking.findUnique({ where: { reference } });
    expect(before?.paymentRequestedAt).toBeNull();

    const payment = await run(requestPaymentTool, { reference, mobileMoneyNumber: MOBILE_MONEY_NUMBER });
    expect(payment.ok).toBe(false);
    expect(typeof payment.error).toBe("string");

    // A failed initiation must not be recorded as one that happened.
    const after = await prisma.booking.findUnique({ where: { reference } });
    expect(after?.paymentRequestedAt).toBeNull();
    expect(after?.paymentStatus).toBe("pending");
  });

  test("resolves a lower-case reference before finding Paynow unconfigured", async () => {
    const created = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-07-01",
      checkOut: "2033-07-03",
      guests: 2,
      guestName: "Lowercase Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "onemoney",
    });

    const payment = await run(requestPaymentTool, {
      reference: (created.reference as string).toLowerCase(),
      mobileMoneyNumber: MOBILE_MONEY_NUMBER,
    });
    // Not "booking not found" — the reference resolved fine; only the gateway is unavailable.
    expect(payment.code).toBeUndefined();
    expect(payment.ok).toBe(false);
  });

  test("reports an unknown reference instead of throwing", async () => {
    const payment = await run(requestPaymentTool, {
      reference: "FC-ZZZZZZ",
      mobileMoneyNumber: MOBILE_MONEY_NUMBER,
    });
    expect(payment.ok).toBe(false);
    expect(payment.code).toBe("BOOKING_NOT_FOUND");
  });

  test("refuses to re-bill a booking already paid", async () => {
    const created = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-08-01",
      checkOut: "2033-08-03",
      guests: 2,
      guestName: "Paid Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    });
    const reference = created.reference as string;

    await prisma.booking.update({
      where: { reference },
      data: { paymentStatus: "verified", bookingStatus: "confirmed" },
    });

    const payment = await run(requestPaymentTool, { reference, mobileMoneyNumber: MOBILE_MONEY_NUMBER });
    expect(payment.ok).toBe(false);
    expect(payment.code).toBe("ALREADY_PAID");
  });

  test("refuses to bill a cancelled booking", async () => {
    const created = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-09-01",
      checkOut: "2033-09-03",
      guests: 2,
      guestName: "Cancelled Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "onemoney",
    });
    const reference = created.reference as string;

    await prisma.booking.update({ where: { reference }, data: { bookingStatus: "cancelled" } });

    const payment = await run(requestPaymentTool, { reference, mobileMoneyNumber: MOBILE_MONEY_NUMBER });
    expect(payment.ok).toBe(false);
    expect(payment.code).toBe("BOOKING_CANCELLED");
  });
});

describe("check-payment-status", () => {
  test("reports there is nothing to check until a payment has been started", async () => {
    const created = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-10-01",
      checkOut: "2033-10-03",
      guests: 2,
      guestName: "Nothing To Check Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "ecocash",
    });

    const status = await run(checkPaymentStatusTool, { reference: created.reference });
    expect(status.ok).toBe(false);
  });

  test("reports an already-verified booking as paid without calling Paynow again", async () => {
    const created = await book({
      propertySlug,
      roomTier: familyTier,
      checkIn: "2033-11-01",
      checkOut: "2033-11-03",
      guests: 2,
      guestName: "Already Paid Guest",
      guestEmail: TEST_EMAIL,
      activitySlugs: [],
      paymentMethod: "onemoney",
    });
    const reference = created.reference as string;

    await prisma.booking.update({
      where: { reference },
      data: { paymentStatus: "verified", bookingStatus: "confirmed" },
    });

    const status = await run(checkPaymentStatusTool, { reference });
    expect(status).toEqual({
      ok: true,
      reference,
      paid: true,
      bookingStatus: "confirmed",
      paymentStatus: "verified",
      amountPaidUsd: 0,
      balanceDueUsd: 0,
    });
  });

  test("reports an unknown reference instead of throwing", async () => {
    const status = await run(checkPaymentStatusTool, { reference: "FC-ZZZZZZ" });
    expect(status.ok).toBe(false);
    expect(status.code).toBe("BOOKING_NOT_FOUND");
  });
});
