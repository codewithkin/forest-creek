import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  buildGuestContext,
  changePaymentMethodTool,
  getPaymentDetailsTool,
  listMyBookingsTool,
  quoteCancellationTool,
  quoteDateChangeTool,
  requestPaymentTool,
} from "@forest-creek/ai";
import { createBooking, getPropertyBySlug, getRooms, prisma, type Booking } from "@forest-creek/db";

/**
 * The payment and quote tools, run the way Mastra runs them. Paynow is not
 * configured here, so nothing can charge a phone: request-payment stops at
 * "not set up" after any method switch.
 */
const GUEST_PHONE = "+263700000077";
const OTHER_PHONE = "+263700000078";
const TEST_EMAIL = "wa-payment-tools-test@example.com";

type Tool = { execute?: unknown };
const runAs = (phone: string | null, tool: Tool, input: unknown) =>
  (tool.execute as (i: unknown, c: unknown) => Promise<Record<string, unknown>>)(
    input,
    phone ? { requestContext: buildGuestContext({ phone, channel: "whatsapp" }) } : {},
  );
const run = (tool: Tool, input: unknown) => runAs(GUEST_PHONE, tool, input);

let roomId: string;
let rate: number;
let n = 0;

async function cleanup() {
  await prisma.receipt.deleteMany({ where: { booking: { guestEmail: TEST_EMAIL } } });
  await prisma.booking.deleteMany({ where: { guestEmail: TEST_EMAIL } });
}

beforeAll(async () => {
  const property = await getPropertyBySlug("forest-creek");
  if (!property) throw new Error("Seed the database first: bun run src/seed.ts in apps/server");
  const room = (await getRooms(property.id))[0]!;
  roomId = room.id;
  rate = room.pricePerNight;
  await cleanup();
});
afterAll(cleanup);

/** Every stay gets nights of its own, years from now. */
const nightsFromBase = (days: number) => new Date(Date.UTC(2035, 0, 1) + days * 86_400_000).toISOString().slice(0, 10);

/** A stay booked from GUEST_PHONE, far enough out that a deposit (not the full stay) is due. */
async function stay(overrides: Partial<{ checkIn: string; checkOut: string; phone: string; method: "ecocash" | "visa" }> = {}) {
  n += 1;
  return createBooking({
    guestName: "Payment Tools Guest",
    guestEmail: TEST_EMAIL,
    guestPhone: overrides.phone ?? GUEST_PHONE,
    roomId,
    checkIn: overrides.checkIn ?? nightsFromBase(n * 3),
    checkOut: overrides.checkOut ?? nightsFromBase(n * 3 + 2),
    guests: 1,
    activityIds: [],
    paymentMethod: overrides.method ?? "ecocash",
    channel: "whatsapp",
  });
}

const paid = (booking: Booking, amountPaid: number) =>
  prisma.booking.update({
    where: { id: booking.id },
    data: {
      amountPaid,
      paymentStatus: amountPaid >= booking.totalAmount ? "verified" : "partial",
      bookingStatus: "confirmed",
    },
  });

describe("list-my-bookings", () => {
  test("finds the guest's own bookings by the phone they message from, and only theirs", async () => {
    const mine = await stay();
    const theirs = await stay({ phone: OTHER_PHONE });

    const result = await run(listMyBookingsTool, {});
    const references = (result.bookings as { reference: string }[]).map((booking) => booking.reference);
    expect(references).toContain(mine.reference);
    expect(references).not.toContain(theirs.reference);
  });

  test("without a phone it asks for the reference instead of guessing", async () => {
    const result = await runAs(null, listMyBookingsTool, {});
    expect(result.ok).toBe(false);
  });
});

describe("get-payment-details", () => {
  test("before anything is paid: the deposit is due now, and paying in full is offered", async () => {
    const booking = await stay();
    const result = await run(getPaymentDetailsTool, { reference: booking.reference });
    expect(result).toMatchObject({
      found: true,
      totalAmountUsd: rate * 2,
      amountPaidUsd: 0,
      dueNowUsd: booking.depositAmount,
      payInFullNowUsd: rate * 2,
      fullyPaid: false,
      canChargeFromChat: true,
    });
    expect(String(result.paymentPageUrl)).toContain(`/pay/${booking.reference}`);
  });

  test("after the deposit: the balance is due, with its date; paid in full: nothing is", async () => {
    const booking = await stay();
    await paid(booking, booking.depositAmount!);
    const partly = await run(getPaymentDetailsTool, { reference: booking.reference });
    expect(partly).toMatchObject({ dueNowUsd: rate * 2 - booking.depositAmount!, dueNowIs: "the balance", fullyPaid: false });
    expect(partly.balanceDueDate).toBeTruthy();
    expect(partly.payInFullNowUsd).toBeUndefined();

    await paid(booking, booking.totalAmount);
    const full = await run(getPaymentDetailsTool, { reference: booking.reference });
    expect(full).toMatchObject({ dueNowUsd: 0, balanceDueUsd: 0, fullyPaid: true, balanceDueDate: null });
  });

  test("an unknown reference is not found, never invented", async () => {
    expect((await run(getPaymentDetailsTool, { reference: "FC-ZZZZZZ" })).found).toBe(false);
  });
});

describe("quote-cancellation", () => {
  test("quotes the policy's figures and cancels nothing", async () => {
    const booking = await stay();
    await paid(booking, booking.depositAmount!);
    const quote = await run(quoteCancellationTool, { reference: booking.reference });
    // Years out, the tier fee is lower than the deposit, so the deposit is what is kept.
    expect(quote).toMatchObject({ found: true, amountPaidUsd: booking.depositAmount, keptUsd: booking.depositAmount, refundUsd: 0 });
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.bookingStatus).toBe("confirmed");
  });
});

describe("quote-date-change", () => {
  test("a low-season stay far out gets its one free change, repriced at today's rate", async () => {
    // February is low season.
    const booking = await stay({ checkIn: "2036-02-10", checkOut: "2036-02-12" });
    const quote = await run(quoteDateChangeTool, {
      reference: booking.reference,
      newCheckIn: "2036-02-20",
      newCheckOut: "2036-02-23",
    });
    expect(quote).toMatchObject({ verdict: "free", roomAvailableOnNewDates: true, nights: 3, newTotalUsd: rate * 3, differenceUsd: rate });
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.checkIn.toISOString().slice(0, 10)).toBe("2036-02-10");
  });
});

describe("change-payment-method", () => {
  test("the owner can switch to card, and is sent to the payment page", async () => {
    const booking = await stay();
    const result = await run(changePaymentMethodTool, { reference: booking.reference, method: "visa" });
    expect(result).toMatchObject({ ok: true, paymentMethod: "visa" });
    expect(String(result.paymentPageUrl)).toContain(`/pay/${booking.reference}`);
  });

  test("someone else's booking is refused and left as it was", async () => {
    const booking = await stay();
    const result = await runAs(OTHER_PHONE, changePaymentMethodTool, { reference: booking.reference, method: "visa" });
    expect(result.ok).toBe(false);
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.paymentMethod).toBe("ecocash");
  });
});

describe("request-payment with a network", () => {
  test("a guest who booked for EcoCash and pays from OneMoney is switched before the charge", async () => {
    const booking = await stay();
    const result = await run(requestPaymentTool, {
      reference: booking.reference,
      mobileMoneyNumber: "0711123456",
      network: "onemoney",
    });
    // Paynow is unconfigured here, so no charge goes out — but the switch landed first.
    expect(result.ok).toBe(false);
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.paymentMethod).toBe("onemoney");
  });

  test("a card booking can move to mobile money from the chat", async () => {
    const booking = await stay({ method: "visa" });
    await run(requestPaymentTool, { reference: booking.reference, mobileMoneyNumber: "0777123456", network: "ecocash" });
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.paymentMethod).toBe("ecocash");
  });

  test("nobody else can switch a guest's booking by naming a network", async () => {
    const booking = await stay();
    const result = await runAs(OTHER_PHONE, requestPaymentTool, {
      reference: booking.reference,
      mobileMoneyNumber: "0711123456",
      network: "onemoney",
    });
    expect(result.ok).toBe(false);
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.paymentMethod).toBe("ecocash");
  });
});
