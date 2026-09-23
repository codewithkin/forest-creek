import { describe, expect, test } from "bun:test";

import {
  extendHoldForPayment,
  holdHasLapsed,
  HOLD_MINUTES,
  newHoldExpiry,
  PAYMENT_WINDOW_MINUTES,
} from "./hold-policy";

const now = new Date("2026-09-23T10:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe("newHoldExpiry", () => {
  test("holds a new booking for the hold window", () => {
    expect(newHoldExpiry(now)).toEqual(minutes(HOLD_MINUTES));
  });
});

describe("extendHoldForPayment", () => {
  test("tops a nearly-expired hold up to cover the payment", () => {
    expect(extendHoldForPayment(minutes(1), now)).toEqual(minutes(PAYMENT_WINDOW_MINUTES));
  });

  test("never shortens a hold that already runs longer", () => {
    expect(extendHoldForPayment(minutes(29), now)).toEqual(minutes(29));
  });

  test("revives a lapsed hold for the length of the payment", () => {
    expect(extendHoldForPayment(minutes(-5), now)).toEqual(minutes(PAYMENT_WINDOW_MINUTES));
  });

  test("leaves a booking that was never a timed hold untimed", () => {
    expect(extendHoldForPayment(null, now)).toBeNull();
  });
});

describe("holdHasLapsed", () => {
  const unpaid = { bookingStatus: "pending", paymentStatus: "pending" };

  test("an unpaid booking past its hold has lapsed", () => {
    expect(holdHasLapsed({ ...unpaid, holdExpiresAt: minutes(-1) }, now)).toBe(true);
  });

  test("an unpaid booking inside its hold still holds the room", () => {
    expect(holdHasLapsed({ ...unpaid, holdExpiresAt: minutes(1) }, now)).toBe(false);
  });

  // Starting the charge already bought it a payment window; past that, the
  // sweep asks Paynow once more before releasing it (see sweepLapsedHolds).
  test("a charge still unpaid past its extended hold has lapsed too", () => {
    expect(
      holdHasLapsed({ ...unpaid, paymentStatus: "processing", holdExpiresAt: minutes(-1) }, now),
    ).toBe(true);
  });

  test("a paid or confirmed stay never lapses", () => {
    expect(
      holdHasLapsed({ ...unpaid, paymentStatus: "verified", holdExpiresAt: minutes(-60) }, now),
    ).toBe(false);
    expect(
      holdHasLapsed({ ...unpaid, bookingStatus: "confirmed", holdExpiresAt: minutes(-60) }, now),
    ).toBe(false);
  });

  test("a booking from before holds existed never lapses", () => {
    expect(holdHasLapsed({ ...unpaid, holdExpiresAt: null }, now)).toBe(false);
  });

  test("an expired booking has lapsed", () => {
    expect(holdHasLapsed({ ...unpaid, bookingStatus: "expired", holdExpiresAt: null }, now)).toBe(
      true,
    );
  });
});
