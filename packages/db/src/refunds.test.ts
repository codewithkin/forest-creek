import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  cancelBooking,
  createBooking,
  getBookingNotifications,
  getBookings,
  prisma,
  recordPaynowPaid,
  recordRefund,
} from "./index";

/** Against the dev database in 2052; every booking here is removed afterwards. */
const PREFIX = "refund-test";
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

let month = 1;
async function book() {
  const m = String(month++).padStart(2, "0");
  return createBooking({
    guestName: "Refund Test",
    guestEmail: `${PREFIX}-${m}@example.com`,
    roomId,
    checkIn: `2052-${m}-10`,
    checkOut: `2052-${m}-12`,
    guests: 1,
    activityIds: [],
    paymentMethod: "ecocash",
    channel: "web",
  });
}

async function paidThenCancelled() {
  const booking = await book();
  await recordPaynowPaid(booking, "paid");
  return cancelBooking(booking.id, "staff@example.com", "Guest cannot travel");
}

async function message(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "(did not reject)";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe("refunds", () => {
  test("cancelling a paid booking marks a refund due and lists it for staff", async () => {
    const cancelled = await paidThenCancelled();
    expect(cancelled.refundStatus).toBe("due");

    const due = await getBookings({ refundStatus: "due", limit: 200 });
    expect(due.some((booking) => booking.id === cancelled.id)).toBe(true);
  });

  test("cancelling an unpaid booking owes nothing", async () => {
    const booking = await book();
    const cancelled = await cancelBooking(booking.id, "staff@example.com");
    expect(cancelled.refundStatus).toBeNull();
    expect(await message(recordRefund({ id: booking.id, outcome: "refunded", note: "x" }, "s"))).toMatch(
      /no refund due/,
    );
  });

  test("recording a refund keeps who, when and the reference, and emails the guest", async () => {
    const cancelled = await paidThenCancelled();
    const after = await recordRefund(
      { id: cancelled.id, outcome: "refunded", note: "EcoCash reversal MP2409.77" },
      "manager@example.com",
    );
    expect(after.refundStatus).toBe("refunded");
    expect(after.refundNote).toBe("EcoCash reversal MP2409.77");
    expect(after.refundedBy).toBe("manager@example.com");
    expect(after.refundedAt).not.toBeNull();

    const emails = await getBookingNotifications(cancelled.id);
    const refunded = emails.find((email) => email.event === "refunded");
    expect(refunded?.audience).toBe("guest");
    expect(refunded?.body).toContain("MP2409.77");
  });

  test("a declined refund records the policy reason and tells the guest", async () => {
    const cancelled = await paidThenCancelled();
    const after = await recordRefund(
      { id: cancelled.id, outcome: "declined", note: "Cancelled on the day of arrival." },
      "manager@example.com",
    );
    expect(after.refundStatus).toBe("declined");
    const emails = await getBookingNotifications(cancelled.id);
    expect(emails.some((email) => email.event === "refund-declined")).toBe(true);
  });

  test("a refund cannot be recorded twice", async () => {
    const cancelled = await paidThenCancelled();
    await recordRefund({ id: cancelled.id, outcome: "refunded", note: "Ref 1" }, "a@example.com");
    expect(
      await message(recordRefund({ id: cancelled.id, outcome: "declined", note: "Ref 2" }, "b@example.com")),
    ).toMatch(/already recorded as refunded/);
  });

  test("the cancellation emails mention the refund", async () => {
    const cancelled = await paidThenCancelled();
    const emails = await getBookingNotifications(cancelled.id);
    const toStaff = emails.find((email) => email.event === "cancelled" && email.audience === "staff");
    expect(toStaff?.subject).toContain("refund due");
  });
});

describe("the cancellation policy applied", () => {
  test("a stay paid in full, cancelled far ahead: the deposit is kept, the rest refunded less 5%", async () => {
    const cancelled = await paidThenCancelled();
    const expected = Math.round((cancelled.totalAmount - Math.ceil(cancelled.totalAmount / 2)) * 100 * 0.95);
    expect(cancelled.refundAmountCents).toBe(expected);
    expect(cancelled.notes).toContain("days before arrival");
    expect(cancelled.notes).toContain("after the 5% processing fee");
  });

  test("the quote staff see before cancelling matches what cancelling records", async () => {
    const { getCancellationQuote } = await import("./index");
    const booking = await book();
    await recordPaynowPaid(booking, "paid");
    const quote = await getCancellationQuote(booking.id);
    const cancelled = await cancelBooking(booking.id, "staff@example.com");
    expect(cancelled.refundAmountCents).toBe(quote.refundCents);
  });

  test("a no-show keeps everything paid", async () => {
    const booking = await book();
    await recordPaynowPaid(booking, "paid");
    const cancelled = await cancelBooking(booking.id, "staff@example.com", undefined, { noShow: true });
    expect(cancelled.refundAmountCents).toBe(0);
    expect(cancelled.refundStatus).toBeNull();
    expect(cancelled.notes).toContain("Marked a no-show");
  });

  test("a credit voucher can be recorded instead of a refund, and the guest is told", async () => {
    const cancelled = await paidThenCancelled();
    const after = await recordRefund(
      { id: cancelled.id, outcome: "credit", note: "Credit voucher CV-001, valid to Sep 2027" },
      "manager@example.com",
    );
    expect(after.refundStatus).toBe("credit");
    const emails = await getBookingNotifications(cancelled.id);
    expect(emails.find((e) => e.event === "credit")?.body).toContain("CV-001");
  });

  test("a Paynow payment landing after cancellation is flagged, not silently kept", async () => {
    const booking = await book();
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paynowChargeAmount: booking.depositAmount,
        paynowPollUrl: "https://www.paynow.co.zw/Interface/CheckPayment/?guid=late-" + booking.reference,
        paymentStatus: "processing",
      },
    });
    const inFlight = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    await cancelBooking(booking.id, "staff@example.com");
    // Paynow's callback for that charge arrives after the cancellation.
    const { applyPaynowStatusUpdate } = await import("./index");
    const outcome = await applyPaynowStatusUpdate({
      reference: booking.reference,
      amount: booking.depositAmount!.toFixed(2),
      paynowReference: "9",
      pollUrl: inFlight.paynowPollUrl!,
      status: "paid",
    });
    expect(outcome).toBe("confirmed");
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.amountPaid).toBe(booking.depositAmount!);
    expect(after.bookingStatus).toBe("cancelled");
    expect(after.reviewNote).toContain("after this booking was cancelled");
  });
});
