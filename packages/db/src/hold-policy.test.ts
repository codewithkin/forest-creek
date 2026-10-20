import { describe, expect, test } from "bun:test";

import { extendHoldForPayment, holdsRoom, isMaybe, isSecured, PAYMENT_WINDOW_MINUTES } from "./hold-policy";

const now = new Date("2026-09-23T10:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
const unpaid = { bookingStatus: "pending", paymentStatus: "pending", amountPaid: 0, holdExpiresAt: null };

describe("extendHoldForPayment", () => {
  test("starting a payment holds the room for the payment window", () => {
    expect(extendHoldForPayment(null, now)).toEqual(minutes(PAYMENT_WINDOW_MINUTES));
    expect(extendHoldForPayment(minutes(-5), now)).toEqual(minutes(PAYMENT_WINDOW_MINUTES));
  });

  test("never shortens a window that already runs longer", () => {
    expect(extendHoldForPayment(minutes(29), now)).toEqual(minutes(29));
  });
});

describe("only money secures a room", () => {
  test("an unpaid booking is a maybe and holds nothing", () => {
    expect(isMaybe(unpaid)).toBe(true);
    expect(isSecured(unpaid)).toBe(false);
    expect(holdsRoom(unpaid, now)).toBe(false);
  });

  test("a deposit or full payment secures it", () => {
    for (const paid of [
      { ...unpaid, paymentStatus: "partial", amountPaid: 60 },
      { ...unpaid, paymentStatus: "verified", amountPaid: 120 },
      { ...unpaid, amountPaid: 50 },
      { ...unpaid, bookingStatus: "confirmed" },
    ]) {
      expect(isSecured(paid)).toBe(true);
      expect(isMaybe(paid)).toBe(false);
      expect(holdsRoom(paid, now)).toBe(true);
    }
  });

  test("a payment in progress holds the room only for its window", () => {
    const paying = { ...unpaid, paymentStatus: "processing" };
    expect(holdsRoom({ ...paying, holdExpiresAt: minutes(5) }, now)).toBe(true);
    expect(holdsRoom({ ...paying, holdExpiresAt: minutes(-1) }, now)).toBe(false);
    // Still a maybe: nothing has been paid.
    expect(isMaybe(paying)).toBe(true);
  });

  test("cancelled and expired bookings hold nothing and are not maybes", () => {
    for (const bookingStatus of ["cancelled", "expired"]) {
      const closed = { ...unpaid, bookingStatus, amountPaid: 60, holdExpiresAt: minutes(5) };
      expect(holdsRoom(closed, now)).toBe(false);
      expect(isMaybe(closed)).toBe(false);
      expect(isSecured(closed)).toBe(false);
    }
  });
});
