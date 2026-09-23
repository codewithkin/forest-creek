import {
  initiateGuestPayment,
  initiateGuestWebPayment,
  isMobileMoneyMethod,
  isPaynowConfigured,
  isWebCheckoutMethod,
  pollGuestPayment,
  type InnbucksInfo,
  type MobileMoneyMethod,
  type PaynowMethod,
  type WebCheckoutMethod,
} from "@forest-creek/payments";

import { BookingError, getBookingByReference, occupyingBookingWhere } from "./bookings";
import { prisma } from "./client";
import type { BookingStatus, PaymentStatus } from "./domain";
import { extendHoldForPayment, holdHasLapsed } from "./hold-policy";

import type { Booking } from "../prisma/generated/client";

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

/** Another stay that now occupies any of this booking's nights, if one does. */
async function clashingStay(booking: Booking) {
  if (!booking.roomId) return null;
  return prisma.booking.findFirst({
    where: {
      id: { not: booking.id },
      roomId: booking.roomId,
      ...occupyingBookingWhere(),
      checkIn: { lt: booking.checkOut },
      checkOut: { gt: booking.checkIn },
    },
    select: { reference: true },
  });
}

/**
 * Starting a payment is the moment to make sure the booking still holds its
 * room. A live hold is topped up to cover the payment; a lapsed one is
 * revived only if nobody has taken the dates since - that is a new, valid
 * hold, not an old one being honoured. Anything else is refused before a
 * guest is charged for a room they cannot have.
 */
async function holdForPayment(booking: Booking) {
  const now = new Date();
  if (holdHasLapsed(booking, now) && (await clashingStay(booking))) {
    throw new BookingError(
      "Those dates were taken after this booking's hold ran out. Please make a new booking.",
      "ROOM_UNAVAILABLE",
    );
  }
  return {
    bookingStatus: booking.bookingStatus === "expired" ? "pending" : booking.bookingStatus,
    holdExpiresAt: extendHoldForPayment(booking.holdExpiresAt, now),
  };
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

  // Checked before the gateway, so a guest whose dates are gone hears that
  // rather than a generic 'not set up' message.
  const hold = await holdForPayment(booking);

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
      ...hold,
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

  // Checked before the gateway, so a guest whose dates are gone hears that
  // rather than a generic 'not set up' message.
  const hold = await holdForPayment(booking);

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
      ...hold,
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

  const updated = await recordPaynowPaid(booking, poll.status);
  return {
    ok: true,
    paid: true,
    bookingStatus: updated.bookingStatus as BookingStatus,
    paymentStatus: "verified",
  };
}

/**
 * Money moved, so the payment is always recorded as verified - that is a fact
 * about Paynow, not a decision. Whether the stay is confirmed is the decision:
 * a guest who paid after their hold lapsed, for dates somebody else has since
 * taken, cannot simply be given the room. That booking is left pending with a
 * review note for staff to refund or re-house, instead of double-booking.
 *
 * Only a booking not already verified is updated, so the poll, the result
 * webhook and a browser refresh can all arrive together and it happens once.
 */
export async function recordPaynowPaid(booking: Booking, paynowStatus: string): Promise<Booking> {
  const clash = holdHasLapsed(booking, new Date()) ? await clashingStay(booking) : null;

  await prisma.booking.updateMany({
    where: { id: booking.id, paymentStatus: { not: "verified" } },
    data: {
      paymentStatus: "verified",
      paynowStatus,
      // Not a staff name: distinguishes an automatic Paynow confirmation from
      // a manager clicking "Mark paid" by hand.
      verifiedBy: "Paynow",
      ...(clash
        ? {
            bookingStatus: "pending",
            reviewNote: `Paid through Paynow after its hold ran out, but ${clash.reference} has since taken these dates. Refund the guest or offer another room.`,
          }
        : { bookingStatus: "confirmed", reviewNote: null }),
    },
  });

  return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

export type SweepResult = { expired: number; paidLate: number };

/**
 * Makes lapsed holds say so. Availability never waits on this - every read
 * already ignores a lapsed hold (occupyingBookingWhere) - but the dashboard
 * should show "expired", not a pending booking nobody is paying for.
 *
 * A charge still in flight gets one last question to Paynow first, so a guest
 * who approved it a minute late is confirmed rather than released.
 */
export async function sweepLapsedHolds(now: Date = new Date()): Promise<SweepResult> {
  const lapsed = await prisma.booking.findMany({
    where: {
      bookingStatus: "pending",
      paymentStatus: { in: ["pending", "processing"] },
      holdExpiresAt: { lte: now },
    },
  });

  const result: SweepResult = { expired: 0, paidLate: 0 };
  for (const booking of lapsed) {
    if (booking.paymentStatus === "processing" && booking.paynowPollUrl && isPaynowConfigured()) {
      const poll = await pollGuestPayment(booking.paynowPollUrl);
      if (poll.ok && poll.paid) {
        await recordPaynowPaid(booking, poll.status);
        result.paidLate++;
        continue;
      }
    }
    const { count } = await prisma.booking.updateMany({
      // Re-checked in the write, so a payment that landed meanwhile wins.
      where: { id: booking.id, bookingStatus: "pending", paymentStatus: { not: "verified" } },
      data: { bookingStatus: "expired" },
    });
    result.expired += count;
  }
  return result;
}

/**
 * What anyone holding a reference may see about the booking: enough to pay
 * for it and recognise it, and nothing that identifies the guest. The
 * reference is the only key a guest has, and references get read out over
 * the phone and pasted into chats, so no email, phone or notes come back.
 */
export type GuestBookingView = {
  reference: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  activityNames: string[];
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  bookingStatus: string;
  /** ISO time the hold runs out, or null when it never does. */
  holdExpiresAt: string | null;
  /** True when the hold ran out; paying first re-checks the room is still free. */
  holdLapsed: boolean;
};

export async function getGuestBookingView(reference: string): Promise<GuestBookingView | null> {
  const booking = await getBookingByReference(reference);
  if (!booking) return null;
  return {
    reference: booking.reference,
    propertyName: booking.propertyName,
    roomName: booking.roomName,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    checkOut: booking.checkOut.toISOString().slice(0, 10),
    nights: booking.nights,
    guests: booking.guests,
    activityNames: booking.activityNames,
    totalAmount: booking.totalAmount,
    paymentMethod: booking.paymentMethod,
    paymentStatus: booking.paymentStatus,
    bookingStatus: booking.bookingStatus,
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    holdLapsed: holdHasLapsed(booking, new Date()),
  };
}

/**
 * Lets a guest switch how they pay for a booking not yet paid for - the
 * payment page offers every method, whichever one they booked with.
 *
 * A charge already in flight is asked about first: switching away from a
 * mobile money prompt the guest has just approved would otherwise drop the
 * only record of where to check that payment.
 */
export async function choosePaymentMethod(
  reference: string,
  method: PaynowMethod,
): Promise<GuestBookingView> {
  let booking = await findLiveBooking(reference);
  if (booking.paymentStatus === "processing" && booking.paynowPollUrl && isPaynowConfigured()) {
    await checkMobileMoneyPayment(booking.reference);
    booking = await findLiveBooking(reference);
  }
  if (booking.paymentStatus === "verified") {
    throw new BookingError("That booking is already paid", "ALREADY_PAID");
  }

  await prisma.booking.update({ where: { id: booking.id }, data: { paymentMethod: method } });
  return (await getGuestBookingView(booking.reference))!;
}
