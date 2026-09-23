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
