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

describe("payments recorded by staff (bank transfer, USD cash)", () => {
  test("a bank-transfer deposit confirms the stay; cash for the rest completes it", async () => {
    const { recordManualPayment } = await import("./index");
    const booking = await book("2054-09-20", "2054-09-23");
    const deposit = booking.depositAmount!;

    const afterDeposit = await recordManualPayment(
      { id: booking.id, amount: deposit, method: "bank_transfer", note: "CBZ ref 12345" },
      "manager@example.com",
    );
    expect(afterDeposit).toMatchObject({ amountPaid: deposit, paymentStatus: "partial", bookingStatus: "confirmed" });
    expect(afterDeposit.notes).toContain("bank transfer recorded by manager@example.com: CBZ ref 12345");

    const afterCash = await recordManualPayment(
      { id: booking.id, amount: booking.totalAmount - deposit, method: "cash", note: "Paid at reception" },
      "manager@example.com",
    );
    expect(afterCash.paymentStatus).toBe("verified");

    const events = await prisma.paymentEvent.findMany({ where: { bookingId: booking.id } });
    expect(events.map((e) => e.source)).toEqual(["manual", "manual"]);
    const emails = (await getBookingNotifications(booking.id)).map((e) => e.event);
    expect(emails).toContain("confirmed");
    expect(emails).toContain("paid-in-full");
  });

  test("more than is outstanding is refused", async () => {
    const { recordManualPayment } = await import("./index");
    const booking = await book("2054-10-20", "2054-10-23");
    let message = "";
    try {
      await recordManualPayment(
        { id: booking.id, amount: booking.totalAmount + 1, method: "cash", note: "x" },
        "manager@example.com",
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("outstanding");
  });

  test("a Paynow charge landing after the stay was covered is flagged as an overpayment", async () => {
    const { recordManualPayment } = await import("./index");
    const booking = await book("2054-11-20", "2054-11-23");
    const inFlight = await chargeInFlight(booking.id, booking.depositAmount!, `over-${booking.reference}`);
    await recordManualPayment(
      { id: booking.id, amount: booking.totalAmount, method: "cash", note: "Paid it all in cash" },
      "manager@example.com",
    );
    const after = await recordPaynowPaid(
      { ...inFlight, amountPaid: booking.totalAmount },
      "paid",
    );
    expect(after.amountPaid).toBe(booking.totalAmount + booking.depositAmount!);
    expect(after.reviewNote).toContain("Overpaid");
  });
});

describe("the balance falling due", () => {
  async function depositPaid(checkIn: string, checkOut: string) {
    const booking = await book(checkIn, checkOut);
    return recordPaynowPaid(
      await chargeInFlight(booking.id, booking.depositAmount!, `due-${booking.reference}`),
      "paid",
    );
  }

  test("the guest is reminded once when the balance is due within three days", async () => {
    const { sendBalanceReminders } = await import("./index");
    const booking = await depositPaid("2054-12-20", "2054-12-23");
    // Not yet: the balance is due years from now.
    expect(await sendBalanceReminders(new Date(), [booking.id])).toBe(0);

    // Two days before it falls due.
    const soon = new Date(booking.balanceDueAt!.getTime() - 2 * 86_400_000);
    expect(await sendBalanceReminders(soon, [booking.id])).toBe(1);
    expect(await sendBalanceReminders(soon, [booking.id])).toBe(0);
    const reminders = (await getBookingNotifications(booking.id)).filter((e) => e.event === "balance-reminder");
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.body).toContain(`$${booking.totalAmount - booking.amountPaid}`);
  });

  test("an unpaid balance past its due date is raised for staff", async () => {
    const { getOperationalAlerts } = await import("./index");
    const booking = await depositPaid("2055-01-20", "2055-01-23");
    const overdue = await prisma.booking.update({
      where: { id: booking.id },
      data: { balanceDueAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    const alerts = await getOperationalAlerts([overdue.propertyId]);
    const item = alerts.items.find((i) => i.bookingId === booking.id);
    expect(item?.kind).toBe("balance-overdue");
    expect(item?.detail).toContain("has not been paid");
  });
});

describe("guards", () => {
  test("a stay starting in the past cannot be booked", async () => {
    let message = "";
    try {
      await book(addDays(lodgeToday(), -2), addDays(lodgeToday(), 1));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("in the past");
  });

  test("an overpayment becomes a refund due of exactly the excess", async () => {
    const { recordManualPayment } = await import("./index");
    const booking = await book("2055-02-20", "2055-02-23");
    const inFlight = await chargeInFlight(booking.id, booking.depositAmount!, `over2-${booking.reference}`);
    await recordManualPayment(
      { id: booking.id, amount: booking.totalAmount, method: "cash", note: "all in cash" },
      "manager@example.com",
    );
    const after = await recordPaynowPaid({ ...inFlight, amountPaid: booking.totalAmount }, "paid");
    expect(after.refundStatus).toBe("due");
    expect(after.refundAmountCents).toBe(booking.depositAmount! * 100);
  });
});
