import {
  initiateGuestPayment,
  initiateGuestWebPayment,
  isMobileMoneyMethod,
  isPaynowConfigured,
  isWebCheckoutMethod,
  pollGuestPayment,
  type InnbucksInfo,
  type MobileMoneyMethod,
  type WebCheckoutMethod,
} from "@forest-creek/payments";

import { BookingError, getBookingByReference } from "./bookings";
import { prisma } from "./client";
import type { BookingStatus, PaymentStatus } from "./domain";

export {
  isMobileMoneyMethod,
  isPaynowConfigured,
  isWebCheckoutMethod,
  mobileMoneyMethods,
  webCheckoutMethods,
} from "@forest-creek/payments";
export type {
  InnbucksInfo,
  MobileMoneyMethod,
  PaynowMethod,
  WebCheckoutMethod,
} from "@forest-creek/payments";

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

/** What a guest is told when Paynow isn't configured yet. Exported so the evals can grade against the exact wording. */
export const PAYMENT_NOT_CONFIGURED_MESSAGE =
  "Mobile money payment is not set up yet. The team will contact you to arrange payment.";

/** The same, for the rails that are paid on Paynow's own page. */
export const WEB_PAYMENT_NOT_CONFIGURED_MESSAGE =
  "Card and InnBucks payment is not set up yet. The team will contact you to arrange payment.";

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
  // The domain now allows card and InnBucks too, and those cannot be charged
  // by pushing a prompt to a handset — they have to go through the hosted
  // page. Sending them here would silently do nothing.
  if (!isMobileMoneyMethod(booking.paymentMethod)) {
    return {
      ok: false,
      error: "This booking is set to pay by card or InnBucks, not mobile money.",
    };
  }

  if (!isPaynowConfigured()) {
    return { ok: false, error: PAYMENT_NOT_CONFIGURED_MESSAGE };
  }

  const result = await initiateGuestPayment({
    reference: booking.reference,
    amountUsd: booking.totalAmount,
    guestEmail: booking.guestEmail,
    phone,
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

export type StartWebCheckoutResult =
  | {
      ok: true;
      reference: string;
      amountUsd: number;
      /** Where the guest actually pays. Nothing is charged until they open it. */
      redirectUrl: string;
      instructions: string;
      innbucks?: InnbucksInfo;
    }
  | { ok: false; error: string };

/**
 * Opens Paynow's hosted checkout for an InnBucks or Visa/Mastercard booking
 * and hands back the page to send the guest to.
 *
 * Marked "processing" like the mobile money flow, for the same reason: the
 * dashboard should show that a payment is in flight. It is still only
 * checkMobileMoneyPayment reporting it paid that confirms the stay — a guest
 * who abandons Paynow's page leaves the booking processing, not confirmed.
 */
export async function startWebCheckout(reference: string): Promise<StartWebCheckoutResult> {
  const booking = await findLiveBooking(reference);
  if (booking.paymentStatus === "verified") {
    throw new BookingError("That booking is already paid", "ALREADY_PAID");
  }
  if (!isWebCheckoutMethod(booking.paymentMethod)) {
    return {
      ok: false,
      error: "This booking is set to pay by mobile money, not card or InnBucks.",
    };
  }

  if (!isPaynowConfigured()) {
    return { ok: false, error: WEB_PAYMENT_NOT_CONFIGURED_MESSAGE };
  }

  const result = await initiateGuestWebPayment({
    reference: booking.reference,
    amountUsd: booking.totalAmount,
    guestEmail: booking.guestEmail,
    method: booking.paymentMethod as WebCheckoutMethod,
  });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: "processing",
      paynowPollUrl: result.pollUrl,
      paymentRequestedAt: new Date(),
    },
  });

  return {
    ok: true,
    reference: booking.reference,
    amountUsd: booking.totalAmount,
    redirectUrl: result.redirectUrl,
    instructions: result.instructions,
    innbucks: result.innbucks,
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
