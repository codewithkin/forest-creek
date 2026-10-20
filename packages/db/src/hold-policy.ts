/**
 * When a booking keeps its room. Import-free, so the rules are unit tested
 * without a database.
 *
 * Only money secures a room: a deposit or full payment. A booking nobody has
 * paid for is a "maybe" — it shows in the dashboard (never as income) and
 * holds nothing, so a guest who books and walks away blocks no one. The one
 * exception is a payment actually in progress: starting a charge holds the
 * room for PAYMENT_WINDOW_MINUTES, so two guests cannot pay for the same
 * nights at once.
 */

/** How long starting a payment holds the room while the guest approves it. */
export const PAYMENT_WINDOW_MINUTES = 20;

const MINUTE = 60_000;

/** The end of the payment window opened now; never shortens one already longer. */
export function extendHoldForPayment(current: Date | null, now: Date): Date {
  const window = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * MINUTE);
  return current && current > window ? current : window;
}

type SecuredState = {
  bookingStatus: string;
  paymentStatus: string;
  amountPaid?: number;
};

type HoldState = SecuredState & { holdExpiresAt: Date | null };

const CLOSED = new Set(["cancelled", "expired"]);

/** Paid for (a deposit or more) or confirmed by staff: the room is the guest's. */
export function isSecured(booking: SecuredState): boolean {
  if (CLOSED.has(booking.bookingStatus)) return false;
  return (
    booking.bookingStatus === "confirmed" ||
    booking.paymentStatus === "partial" ||
    booking.paymentStatus === "verified" ||
    (booking.amountPaid ?? 0) > 0
  );
}

/** An open booking nobody has paid for yet. Shown to staff, never counted as income. */
export function isMaybe(booking: SecuredState): boolean {
  return !CLOSED.has(booking.bookingStatus) && !isSecured(booking);
}

/** Whether the booking keeps its room right now: secured, or in a payment's window. */
export function holdsRoom(booking: HoldState, now: Date): boolean {
  if (CLOSED.has(booking.bookingStatus)) return false;
  return isSecured(booking) || (booking.holdExpiresAt !== null && booking.holdExpiresAt > now);
}
