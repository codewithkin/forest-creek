import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { applyPaynowStatusUpdate, createBooking, prisma, type PaynowStatusUpdate } from "./index";

/**
 * Against the dev database, on dates far out; every row uses this file's
 * email prefix and is removed afterwards. The hash is checked one layer up
 * (packages/payments), so these start from an already-verified update.
 */
const PREFIX = "paynow-result-test";
const POLL_URL = "https://www.paynow.co.zw/Interface/CheckPayment/?guid=test-";
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

let day = 1;
/** A booking with a charge in flight, as initiateMobileMoneyPayment leaves it. */
async function processingBooking() {
  const d = String(day++).padStart(2, "0");
  const booking = await createBooking({
    guestName: "Result Test",
    guestEmail: `${PREFIX}-${d}@example.com`,
    roomId,
    checkIn: `2046-01-${d}`,
    checkOut: `2046-01-${String(day).padStart(2, "0")}`,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });
  return prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "processing", paynowPollUrl: POLL_URL + booking.reference },
  });
}

const updateFor = (
  booking: { reference: string; totalAmount: number },
  overrides: Partial<PaynowStatusUpdate> = {},
): PaynowStatusUpdate => ({
  reference: booking.reference,
  amount: booking.totalAmount.toFixed(2),
  paynowReference: "9876543",
  pollUrl: POLL_URL + booking.reference,
  status: "paid",
  ...overrides,
});

const reload = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });

describe("applyPaynowStatusUpdate", () => {
  test("a paid update for the right charge and amount confirms the stay", async () => {
    const booking = await processingBooking();
    expect(await applyPaynowStatusUpdate(updateFor(booking))).toBe("confirmed");

    const after = await reload(booking.id);
    expect(after.paymentStatus).toBe("verified");
    expect(after.bookingStatus).toBe("confirmed");
    expect(after.verifiedBy).toBe("Paynow");
    expect(after.paynowReference).toBe("9876543");
  });

  test("the same callback delivered twice is a no-op the second time", async () => {
    const booking = await processingBooking();
    await applyPaynowStatusUpdate(updateFor(booking));
    const first = await reload(booking.id);

    expect(await applyPaynowStatusUpdate(updateFor(booking))).toBe("already-paid");
    const second = await reload(booking.id);
    expect(second.updatedAt).toEqual(first.updatedAt);
  });

  test("a paid update for the wrong amount is flagged for staff, not confirmed", async () => {
    const booking = await processingBooking();
    expect(await applyPaynowStatusUpdate(updateFor(booking, { amount: "1.00" }))).toBe(
      "amount-mismatch",
    );

    const after = await reload(booking.id);
    expect(after.paymentStatus).toBe("processing");
    expect(after.bookingStatus).toBe("pending");
    expect(after.reviewNote).toContain("1.00");
  });

  test("an update carrying another transaction's poll URL changes nothing", async () => {
    const booking = await processingBooking();
    const outcome = await applyPaynowStatusUpdate(
      updateFor(booking, { pollUrl: POLL_URL + "someone-else" }),
    );
    expect(outcome).toBe("poll-url-mismatch");
    expect((await reload(booking.id)).paymentStatus).toBe("processing");
  });

  test("a cancelled update is recorded but leaves the booking payable", async () => {
    const booking = await processingBooking();
    expect(await applyPaynowStatusUpdate(updateFor(booking, { status: "cancelled" }))).toBe(
      "status-recorded",
    );
    const after = await reload(booking.id);
    expect(after.paymentStatus).toBe("processing");
    expect(after.paynowStatus).toBe("cancelled");
  });

  test("a late cancelled update never un-pays a confirmed booking", async () => {
    const booking = await processingBooking();
    await applyPaynowStatusUpdate(updateFor(booking));
    expect(await applyPaynowStatusUpdate(updateFor(booking, { status: "cancelled" }))).toBe(
      "already-paid",
    );
    const after = await reload(booking.id);
    expect(after.paymentStatus).toBe("verified");
    expect(after.paynowStatus).toBe("paid");
  });

  test("an update for a booking that never started a payment is ignored", async () => {
    const booking = await processingBooking();
    await prisma.booking.update({ where: { id: booking.id }, data: { paynowPollUrl: null } });
    expect(await applyPaynowStatusUpdate(updateFor(booking))).toBe("no-payment-started");
  });

  test("an update for a reference we never issued is ignored", async () => {
    expect(
      await applyPaynowStatusUpdate(updateFor({ reference: "FC-NOPE99", totalAmount: 10 })),
    ).toBe("unknown-booking");
  });
});
