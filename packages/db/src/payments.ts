import {
  initiateGuestPayment,
  isPaynowConfigured,
  pollGuestPayment,
  type MobileMoneyMethod,
} from "@forest-creek/payments";

import { BookingError, getBookingByReference } from "./bookings";
import { prisma } from "./client";
import type { BookingStatus, PaymentStatus } from "./domain";

export { isPaynowConfigured } from "@forest-creek/payments";
export type { MobileMoneyMethod } from "@forest-creek/payments";

async function findLiveBooking(reference: string) {
  const booking = await getBookingByReference(reference);
  if (!booking) {
    throw new BookingError("No booking with reference " + reference, "BOOKING_NOT_FOUND");
  }
  if (booking.bookingStatus === "cancelled") {
    throw new BookingError("That booking was cancelled", "BOOKING_CANCELLED");
  }
  return booking;
}

export type InitiatePaymentResult =
  | { ok: true; reference: string; amountUsd: number; instructions: string }
  | { ok: false; error: string };

/**
 * Sends a real Ecocash/OneMoney charge to the guest's own phone via Paynow.
 * Moves the booking to "processing" so the dashboard and the guest both see a
 * charge is in flight — only checkMobileMoneyPayment reporting it paid
 * confirms the stay; this never does.
 */
export async function initiateMobileMoneyPayment(
  reference: string,
  phone: string,
): Promise<InitiatePaymentResult> {
  const booking = await findLiveBooking(reference);
  if (booking.paymentStatus === "verified") {
    throw new BookingError("That booking is already paid", "ALREADY_PAID");
  }

  if (!isPaynowConfigured()) {
    return {
      ok: false,
      error: "Mobile money payment is not set up yet. The team will contact you to arrange payment.",
    };
  }

  const result = await initiateGuestPayment({
    reference: booking.reference,
    amountUsd: booking.totalAmount,
    guestEmail: booking.guestEmail,
    phone,
    // Chosen by the guest at booking time; the domain only allows the two
    // Paynow mobile money rails, so this is never anything else.
    method: booking.paymentMethod as MobileMoneyMethod,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: "processing",
      mobileMoneyNumber: phone,
      paynowPollUrl: result.pollUrl,
      paymentRequestedAt: new Date(),
    },
  });

  return {
    ok: true,
    reference: booking.reference,
    amountUsd: booking.totalAmount,
    instructions: result.instructions,
  };
}

export type CheckPaymentResult =
  | { ok: true; paid: boolean; bookingStatus: BookingStatus; paymentStatus: PaymentStatus }
  | { ok: false; error: string };

/**
 * Polls Paynow for a charge already in flight. Being paid is the only thing
 * that auto-confirms a booking — Paynow reporting "cancelled" or "created"
 * just leaves it processing so the guest can retry, rather than rejecting the
 * booking automatically.
 */
export async function checkMobileMoneyPayment(reference: string): Promise<CheckPaymentResult> {
  const booking = await findLiveBooking(reference);

  if (booking.paymentStatus === "verified") {
    return {
      ok: true,
      paid: true,
      bookingStatus: booking.bookingStatus as BookingStatus,
      paymentStatus: "verified",
    };
  }
  if (!booking.paynowPollUrl) {
    return { ok: false, error: "No payment has been started for this booking yet." };
  }

  const poll = await pollGuestPayment(booking.paynowPollUrl);
  if (!poll.ok) return { ok: false, error: poll.error };

  if (!poll.paid) {
    await prisma.booking.update({ where: { id: booking.id }, data: { paynowStatus: poll.status } });
    return {
      ok: true,
      paid: false,
      bookingStatus: booking.bookingStatus as BookingStatus,
      paymentStatus: booking.paymentStatus as PaymentStatus,
    };
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: "verified",
      bookingStatus: "confirmed",
      paynowStatus: poll.status,
      // Not a staff name: distinguishes an automatic Paynow confirmation from
      // a manager clicking "Mark paid" by hand.
      verifiedBy: "Paynow",
    },
  });

  return { ok: true, paid: true, bookingStatus: updated.bookingStatus as BookingStatus, paymentStatus: "verified" };
}
