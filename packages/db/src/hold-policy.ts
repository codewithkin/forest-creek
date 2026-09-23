/**
 * How long an unpaid booking keeps its dates. Import-free, so the rules are
 * unit tested without a database.
 *
 * Before holds, a guest who booked and walked away blocked the room for good:
 * the dates only came back when staff noticed and cancelled by hand.
 */

/** A new booking holds its room this long while the guest pays. */
export const HOLD_MINUTES = 30;

/**
 * Starting a payment tops the hold up to at least this much, so a guest who
 * reaches Paynow on minute 29 is not released while approving the charge.
 */
export const PAYMENT_WINDOW_MINUTES = 20;

const MINUTE = 60_000;

export function newHoldExpiry(now: Date): Date {
  return new Date(now.getTime() + HOLD_MINUTES * MINUTE);
}

/** Never shortens a hold — only pushes it out to cover a payment in flight. */
export function extendHoldForPayment(current: Date | null, now: Date): Date | null {
  // No expiry means the booking was never a timed hold (older bookings); keep it that way.
  if (current === null) return null;
  const window = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * MINUTE);
  return current > window ? current : window;
}

type HoldState = {
  bookingStatus: string;
  paymentStatus: string;
  holdExpiresAt: Date | null;
};

/**
 * Whether a booking's claim on its room has run out: unpaid, unconfirmed and
 * past its hold. Paid or confirmed stays never lapse, and neither do bookings
 * made before holds existed (no expiry recorded).
 */
export function holdHasLapsed(booking: HoldState, now: Date): boolean {
  if (booking.bookingStatus === "expired") return true;
  if (booking.bookingStatus !== "pending") return false;
  if (booking.paymentStatus === "verified") return false;
  return booking.holdExpiresAt !== null && booking.holdExpiresAt <= now;
}
