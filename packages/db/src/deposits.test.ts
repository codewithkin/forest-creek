import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  addDays,
  applyPaynowStatusUpdate,
  checkMobileMoneyPayment,
  createBooking,
  getBookingNotifications,
  isRoomAvailable,
  lodgeToday,
  nextCharge,
  prisma,
  recordPaynowPaid,
} from "./index";

/**
 * The deposit-then-balance flow of the Booking & Cancellation Policy, against
 * the dev database. Paynow is unconfigured in tests, so a charge "in flight"
 * is written directly, as initiateMobileMoneyPayment would leave it.
 */
const PREFIX = "deposit-test";
let roomId: string;

async function cleanup() {
  await prisma.paymentEvent.deleteMany({ where: { booking: { guestEmail: { startsWith: PREFIX } } } });
  await prisma.booking.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  const room = await prisma.room.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (!room) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  roomId = room.id;
  await cleanup();
});
afterAll(cleanup);

let n = 1;
function book(checkIn: string, checkOut: string) {
  return createBooking({
    guestName: "Deposit Test",
    guestEmail: `${PREFIX}-${n++}@example.com`,
    roomId,
    checkIn,
    checkOut,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
    policyAccepted: true,
  });
}

/** Puts a charge for `amount` in flight, as starting a Paynow payment does. */
function chargeInFlight(id: string, amount: number, tag: string) {
  return prisma.booking.update({
    where: { id },
    data: {
      paynowChargeAmount: amount,
      paynowPollUrl: `https://www.paynow.co.zw/Interface/CheckPayment/?guid=${tag}`,
      paymentRequestedAt: new Date(),
    },
  });
}

describe("a stay booked well ahead", () => {
  test("is created with a 50% deposit, the balance due 14 days before arrival, and the policy accepted", async () => {
    const booking = await book("2054-05-20", "2054-05-23");
    expect(booking.depositAmount).toBe(Math.ceil(booking.totalAmount / 2));
    expect(booking.balanceDueAt?.toISOString().slice(0, 10)).toBe("2054-05-06");
    expect(booking.policyAcceptedAt).not.toBeNull();
    expect(nextCharge(booking)).toMatchObject({ amount: booking.depositAmount, kind: "deposit" });
    expect(nextCharge(booking, { payInFull: true })).toMatchObject({ amount: booking.totalAmount, kind: "full" });
  });

  test("its deposit confirms it once, however many times the payment is reported", async () => {
    const booking = await book("2054-06-20", "2054-06-23");
    const deposit = booking.depositAmount!;
    const inFlight = await chargeInFlight(booking.id, deposit, `dep-${booking.reference}`);

    const first = await recordPaynowPaid(inFlight, "paid");
    const second = await recordPaynowPaid(inFlight, "paid");

    expect(first.amountPaid).toBe(deposit);
    expect(second.amountPaid).toBe(deposit);
    expect(first.paymentStatus).toBe("partial");
    expect(first.bookingStatus).toBe("confirmed");
    expect(first.paynowChargeAmount).toBeNull();

    const check = await checkMobileMoneyPayment(booking.reference);
    expect(check).toMatchObject({ ok: true, paid: true, balanceDue: booking.totalAmount - deposit });
    expect(nextCharge(first)).toMatchObject({ amount: booking.totalAmount - deposit, kind: "balance" });
  });

  test("the balance then completes it and sends the paid-in-full email", async () => {
    const booking = await book("2054-07-20", "2054-07-23");
    const deposit = booking.depositAmount!;
    await recordPaynowPaid(await chargeInFlight(booking.id, deposit, `dep2-${booking.reference}`), "paid");
    const balance = booking.totalAmount - deposit;
    const after = await recordPaynowPaid(
      await chargeInFlight(booking.id, balance, `bal-${booking.reference}`),
      "paid",
    );

    expect(after.amountPaid).toBe(booking.totalAmount);
    expect(after.paymentStatus).toBe("verified");
    const events = (await getBookingNotifications(booking.id)).map((e) => e.event);
    expect(events).toContain("confirmed");
    expect(events).toContain("paid-in-full");
    expect(() => nextCharge(after)).toThrow(/already paid/);
  });

  test("a callback is checked against the charge's own amount, not the stay's", async () => {
    const booking = await book("2054-08-20", "2054-08-23");
    const deposit = booking.depositAmount!;
    const pollTag = `cb-${booking.reference}`;
    await chargeInFlight(booking.id, deposit, pollTag);
    const pollUrl = `https://www.paynow.co.zw/Interface/CheckPayment/?guid=${pollTag}`;

    const wrong = await applyPaynowStatusUpdate({
      reference: booking.reference,
      amount: booking.totalAmount.toFixed(2),
      paynowReference: "1",
      pollUrl,
      status: "paid",
    });
    expect(wrong).toBe("amount-mismatch");

    const right = await applyPaynowStatusUpdate({
      reference: booking.reference,
      amount: deposit.toFixed(2),
      paynowReference: "1",
      pollUrl,
      status: "paid",
    });
    expect(right).toBe("confirmed");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.amountPaid).toBe(deposit);

    // Paynow retrying the same callback changes nothing.
    const replay = await applyPaynowStatusUpdate({
      reference: booking.reference,
      amount: deposit.toFixed(2),
      paynowReference: "1",
      pollUrl,
      status: "paid",
    });
    expect(replay).toBe("already-paid");
  });
});

describe("a stay booked within 14 days of arrival", () => {
  test("must be paid in full now", async () => {
    // A free pair of nights in the next two weeks on the dev database.
    const today = lodgeToday();
    let checkIn: string | undefined;
    for (let offset = 3; offset <= 12 && !checkIn; offset++) {
      const day = addDays(today, offset);
      if (await isRoomAvailable(roomId, day, addDays(day, 1))) checkIn = day;
    }
    if (!checkIn) return; // every night is taken on this dev database; nothing to test
    const booking = await book(checkIn, addDays(checkIn, 1));

    expect(booking.depositAmount).toBe(booking.totalAmount);
    expect(booking.balanceDueAt).toBeNull();
    expect(nextCharge(booking)).toMatchObject({ amount: booking.totalAmount, kind: "full" });
  });
});
