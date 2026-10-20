import { z } from "zod";
import {
  initiateGuestPayment,
  initiateGuestWebPayment,
  isMobileMoneyMethod,
  isPaynowConfigured,
  isPaidStatus,
  isPaynowSetupError,
  isWebCheckoutMethod,
  pollGuestPayment,
  type InnbucksInfo,
  type PaynowStatusUpdate,
  type MobileMoneyMethod,
  type PaynowMethod,
  type WebCheckoutMethod,
} from "@forest-creek/payments";

import {
  BookingError,
  getBookingByReference,
  lockRoom,
  occupyingBookingWhere,
  toStayDate,
} from "./bookings";
import { prisma } from "./client";
import type { BookingStatus, PaymentStatus } from "./domain";
import { addDays, amountDueNow, lodgeToday } from "./booking-policy";
import { extendHoldForPayment, holdsRoom } from "./hold-policy";
import { notifyBooking } from "./notifications";
import { recordPaymentEvent } from "./payment-events";
import { issueReceipt } from "./receipts";
import { blockOverlapWhere } from "./room-blocks";

import type { Booking } from "../prisma/generated/client";

export {
  isMobileMoneyMethod,
  isPaynowConfigured,
  isWebCheckoutMethod,
  mobileMoneyMethods,
  PAYNOW_RESULT_PATH,
  verifyPaynowStatusUpdate,
  webCheckoutMethods,
} from "@forest-creek/payments";
export type {
  InnbucksInfo,
  PaynowStatusUpdate,
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

/**
 * Whatever now occupies any of this booking's nights - another stay, or a
 * block staff put on the room - described for a review note.
 */
async function clashingStay(booking: Booking): Promise<{ reference: string } | null> {
  if (!booking.roomId) return null;
  const [stay, block] = await Promise.all([
    prisma.booking.findFirst({
      where: {
        id: { not: booking.id },
        roomId: booking.roomId,
        ...occupyingBookingWhere(),
        checkIn: { lt: booking.checkOut },
        checkOut: { gt: booking.checkIn },
      },
      select: { reference: true },
    }),
    prisma.roomBlock.findFirst({
      where: { roomId: booking.roomId, ...blockOverlapWhere(booking.checkIn, booking.checkOut) },
      select: { reason: true },
    }),
  ]);
  if (stay) return stay;
  if (block) return { reference: `a staff block (${block.reason})` };
  return null;
}

/**
 * Starting a payment is the moment to claim the room. An unpaid booking holds
 * nothing, so first make sure nobody has secured these nights since (a paid
 * stay, another payment in progress, or a staff block), then hold them for
 * the payment window. Anything else is refused before a guest is charged for
 * a room they cannot have.
 *
 * The check and the hold are written together under the room's lock (the
 * same one createBooking takes). Written before the gateway call: if Paynow
 * then fails, the window simply runs out.
 */
async function holdForPayment(booking: Booking) {
  const now = new Date();
  const hold = {
    bookingStatus: booking.bookingStatus === "expired" ? "pending" : booking.bookingStatus,
    holdExpiresAt: extendHoldForPayment(booking.holdExpiresAt, now),
  };
  // Already the guest's (a balance payment) or already inside a window: nothing to check.
  if (holdsRoom(booking, now) || !booking.roomId) return hold;
  if (booking.checkIn < toStayDate(lodgeToday(now))) {
    throw new BookingError("This booking's arrival date has passed. Please make a new booking.", "ROOM_UNAVAILABLE");
  }

  const roomId = booking.roomId;
  return prisma.$transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const clash = await tx.booking.findFirst({
      where: {
        id: { not: booking.id },
        roomId,
        ...occupyingBookingWhere(now),
        checkIn: { lt: booking.checkOut },
        checkOut: { gt: booking.checkIn },
      },
      select: { id: true },
    });
    const block = await tx.roomBlock.findFirst({
      where: { roomId, ...blockOverlapWhere(booking.checkIn, booking.checkOut) },
      select: { id: true },
    });
    if (clash || block) {
      throw new BookingError(
        "Sorry — those dates are no longer available (another guest has booked them), so nothing was charged. Please choose other dates or another room.",
        "ROOM_UNAVAILABLE",
      );
    }
    await tx.booking.update({ where: { id: booking.id }, data: hold });
    return hold;
  });
}

/** What a guest is told when Paynow isn't configured yet. Exported so the evals can grade against the exact wording. */
export const PAYMENT_NOT_CONFIGURED_MESSAGE =
  "Mobile money payment is not set up yet. The team will contact you to arrange payment.";

/** The same, for the rails that are paid on Paynow's own page. */
/**
 * What a guest hears when Paynow refuses a charge because OUR setup is wrong
 * (e.g. "Invalid Hash"): nothing they can fix, and Paynow's wording means
 * nothing to them. Staff get the exact reason, with a diagnosis, in the logs
 * and on the booking's payment panel.
 */
export const PAYMENT_SETUP_PROBLEM_MESSAGE =
  "The payment service couldn't take this charge because of a setup problem on our side — nothing was charged, and it isn't your phone or number. The reservations team has been alerted and will help you pay.";

export const WEB_PAYMENT_NOT_CONFIGURED_MESSAGE =
  "Card and InnBucks payment is not set up yet. The team will contact you to arrange payment.";

export type ChargeKind = "deposit" | "balance" | "full";

export type InitiatePaymentResult =
  | {
      ok: true;
      reference: string;
      amountUsd: number;
      /** Deposit, balance, or the whole stay in one go. */
      kind: ChargeKind;
      /** What will still be owed once this charge is paid. */
      balanceAfter: number;
      instructions: string;
    }
  | { ok: false; error: string };

export type PaymentOptions = {
  /** Pay the whole stay now rather than the deposit (only matters before any payment). */
  payInFull?: boolean;
};

/**
 * Paynow's own reason, safe to keep: anything shaped like an email address or
 * a phone number is masked, since a refusal can echo what we sent.
 */
export function redactPaynowError(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]")
    .slice(0, 280);
}

/**
 * Paynow refused to start a charge. Logged and kept on the booking's payment
 * log with Paynow's exact words: the guest is only told it failed, and staff
 * need the reason (live, "the payment service returned an error" was all
 * anyone could see).
 */
async function recordChargeRefused(booking: Booking, amount: number, method: string, error: string): Promise<void> {
  const detail = redactPaynowError(error);
  console.warn(`[payments] Paynow refused to start a ${method} charge of $${amount} for ${booking.reference}: ${detail}`);
  await recordPaymentEvent({
    bookingId: booking.id,
    source: "initiate",
    reference: booking.reference,
    outcome: "refused",
    detail,
    amount: String(amount),
  });
}

/** A charge is in flight when one was started and has not been credited yet. */
export function chargeInFlight(booking: Booking): boolean {
  return booking.paynowChargeAmount !== null || booking.paymentStatus === "processing";
}

/**
 * The next charge for a booking, per the policy: the deposit first (or the
 * whole stay if the guest chooses), then the balance. Refused once nothing is
 * owed.
 */
export function nextCharge(booking: Booking, options: PaymentOptions = {}) {
  const amount = amountDueNow(booking, options.payInFull);
  if (amount <= 0 || booking.paymentStatus === "verified") {
    throw new BookingError("That booking is already paid", "ALREADY_PAID");
  }
  const balanceAfter = booking.totalAmount - booking.amountPaid - amount;
  const kind: ChargeKind = booking.amountPaid > 0 ? "balance" : balanceAfter > 0 ? "deposit" : "full";
  const title = kind === "deposit" ? "Deposit (50%)" : kind === "balance" ? "Balance" : "Stay";
  return { amount, balanceAfter, kind, title };
}

/** What starting a charge writes, whichever rail it went through. */
function chargeStarted(booking: Booking, amount: number, pollUrl: string) {
  return {
    // "processing" only before anything is paid; a balance charge on a
    // confirmed stay keeps it "partial", and paynowChargeAmount says a charge
    // is in flight.
    paymentStatus: booking.amountPaid > 0 ? booking.paymentStatus : "processing",
    paynowPollUrl: pollUrl,
    paynowChargeAmount: amount,
    paymentRequestedAt: new Date(),
  };
}

/**
 * Sends a real EcoCash/OneMoney charge to the guest's own phone via Paynow,
 * for whatever the policy says is due now. Only Paynow reporting it paid
 * credits it; this never does.
 */
export async function initiateMobileMoneyPayment(
  reference: string,
  phone: string,
  options: PaymentOptions = {},
): Promise<InitiatePaymentResult> {
  const booking = await findLiveBooking(reference);
  const charge = nextCharge(booking, options);
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
    amountUsd: charge.amount,
    guestEmail: booking.guestEmail,
    phone,
    method: booking.paymentMethod as MobileMoneyMethod,
    title: charge.title,
  });
  if (!result.ok) {
    await recordChargeRefused(booking, charge.amount, booking.paymentMethod, result.error);
    return { ok: false, error: isPaynowSetupError(result.error) ? PAYMENT_SETUP_PROBLEM_MESSAGE : result.error };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { ...hold, ...chargeStarted(booking, charge.amount, result.pollUrl), mobileMoneyNumber: phone },
  });

  return {
    ok: true,
    reference: booking.reference,
    amountUsd: charge.amount,
    kind: charge.kind,
    balanceAfter: charge.balanceAfter,
    instructions: result.instructions,
  };
}

export type StartWebCheckoutResult =
  | {
      ok: true;
      reference: string;
      amountUsd: number;
      kind: ChargeKind;
      balanceAfter: number;
      /** Where the guest actually pays. Nothing is charged until they open it. */
      redirectUrl: string;
      instructions: string;
      innbucks?: InnbucksInfo;
    }
  | { ok: false; error: string };

/**
 * Opens Paynow's hosted checkout for an InnBucks or Visa/Mastercard booking,
 * for whatever the policy says is due now, and hands back the page to send
 * the guest to. A guest who abandons Paynow's page leaves the charge in
 * flight, never credited.
 */
export async function startWebCheckout(
  reference: string,
  options: PaymentOptions = {},
): Promise<StartWebCheckoutResult> {
  const booking = await findLiveBooking(reference);
  const charge = nextCharge(booking, options);
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
    amountUsd: charge.amount,
    guestEmail: booking.guestEmail,
    method: booking.paymentMethod as WebCheckoutMethod,
    title: charge.title,
  });
  if (!result.ok) {
    await recordChargeRefused(booking, charge.amount, booking.paymentMethod, result.error);
    return { ok: false, error: isPaynowSetupError(result.error) ? PAYMENT_SETUP_PROBLEM_MESSAGE : result.error };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { ...hold, ...chargeStarted(booking, charge.amount, result.pollUrl) },
  });

  return {
    ok: true,
    reference: booking.reference,
    amountUsd: charge.amount,
    kind: charge.kind,
    balanceAfter: charge.balanceAfter,
    redirectUrl: result.redirectUrl,
    instructions: result.instructions,
    innbucks: result.innbucks,
  };
}

export type CheckPaymentResult =
  | {
      ok: true;
      /** Whether the charge asked about has been paid. */
      paid: boolean;
      bookingStatus: BookingStatus;
      paymentStatus: PaymentStatus;
      amountPaid: number;
      /** Still owed on the stay after what has been paid. */
      balanceDue: number;
    }
  | { ok: false; error: string };

function checkResult(booking: Booking, paid: boolean): CheckPaymentResult {
  return {
    ok: true,
    paid,
    bookingStatus: booking.bookingStatus as BookingStatus,
    paymentStatus: booking.paymentStatus as PaymentStatus,
    amountPaid: booking.amountPaid,
    // "verified" is paid in full whatever amountPaid says (older rows).
    balanceDue: booking.paymentStatus === "verified" ? 0 : Math.max(0, booking.totalAmount - booking.amountPaid),
  };
}

/**
 * Polls Paynow for the charge in flight. Being paid is the only thing that
 * credits a payment — Paynow reporting "cancelled" or "created" just leaves
 * it in flight so the guest can retry, rather than rejecting the booking.
 * With nothing in flight, it reports whether the last charge was paid.
 */
export async function checkMobileMoneyPayment(reference: string): Promise<CheckPaymentResult> {
  const booking = await findLiveBooking(reference);

  if (!chargeInFlight(booking)) {
    if (booking.amountPaid > 0 || booking.paymentStatus === "verified") return checkResult(booking, true);
    if (!booking.paynowPollUrl) {
      return { ok: false, error: "No payment has been started for this booking yet." };
    }
    return checkResult(booking, false);
  }
  if (!booking.paynowPollUrl) {
    return { ok: false, error: "No payment has been started for this booking yet." };
  }

  const poll = await pollGuestPayment(booking.paynowPollUrl);
  if (!poll.ok) {
    await recordPaymentEvent({
      bookingId: booking.id,
      source: "poll",
      reference: booking.reference,
      outcome: "error",
      detail: poll.error,
    });
    return { ok: false, error: poll.error };
  }

  if (!poll.paid) {
    // Logged when it changes (the pay page polls every 4s), so a charge that
    // never confirms shows what Paynow kept saying.
    if (poll.status !== booking.paynowStatus) {
      console.log(`[payments] ${booking.reference}: Paynow says "${poll.status}" (not paid yet)`);
    }
    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { paynowStatus: poll.status },
    });
    return checkResult(updated, false);
  }
  console.log(`[payments] ${booking.reference}: Paynow says "${poll.status}" — crediting $${booking.paynowChargeAmount ?? "?"}`);

  await recordPaymentEvent({
    bookingId: booking.id,
    source: "poll",
    reference: booking.reference,
    status: poll.status,
    outcome: "confirmed",
  });
  return checkResult(await recordPaynowPaid(booking, poll.status), true);
}

/**
 * Credits a Paynow charge that has been paid. Money moved, so it is always
 * added to amountPaid - that is a fact about Paynow, not a decision.
 *
 * Crediting clears paynowChargeAmount in the same write that adds it, so the
 * poll, the result callback and a browser refresh can all arrive together and
 * the charge counts once. (A charge started before deposits existed has no
 * amount on record: it was for the whole outstanding stay, and is guarded by
 * amountPaid still being what it was.)
 *
 * The first payment - deposit or whole stay - confirms the booking, unless
 * the guest paid after their hold lapsed and someone else has the dates:
 * that booking is left pending with a review note for staff to refund or
 * re-house, instead of double-booking.
 */
export async function recordPaynowPaid(booking: Booking, paynowStatus: string): Promise<Booking> {
  // A booking that was not holding its room (its payment window ran out) may
  // have lost the nights to someone who paid first.
  const clash = holdsRoom(booking, new Date()) ? null : await clashingStay(booking);
  const charge = booking.paynowChargeAmount;
  const amount = charge ?? Math.max(0, booking.totalAmount - booking.amountPaid);

  const credited = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where:
        charge !== null
          ? { id: booking.id, paynowChargeAmount: { not: null }, paynowPollUrl: booking.paynowPollUrl }
          : {
              id: booking.id,
              paymentStatus: { not: "verified" },
              paynowChargeAmount: null,
              amountPaid: booking.amountPaid,
            },
      data: {
        amountPaid: { increment: amount },
        paynowChargeAmount: null,
        paynowStatus,
        // Not a staff name: distinguishes an automatic Paynow confirmation from
        // a manager recording a payment by hand.
        verifiedBy: "Paynow",
      },
    });
    if (count === 0) return null;

    const after = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // The receipt is issued with the credit, so the two can never disagree.
    await issueReceipt(tx, {
      booking: after,
      paidBefore: after.amountPaid - amount,
      amount,
      method: after.paymentMethod,
      source: "paynow",
      paynowReference: after.paynowReference,
    });
    const wasPending = after.bookingStatus === "pending" || after.bookingStatus === "expired";
    // A charge that lands after staff recorded a cash or bank payment can
    // take the booking over its total: money to give back, so staff hear.
    const overpaid = after.amountPaid - after.totalAmount;
    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: after.amountPaid >= after.totalAmount ? "verified" : "partial",
        // Money that has to go back is a refund due, so it lands in the
        // refund panel and the "Refunds due" tab, not only in a note.
        ...(overpaid > 0 && !clash
          ? {
              reviewNote: `Overpaid by $${overpaid}: a Paynow payment arrived after the stay was already covered. Refund the difference.`,
              refundStatus: "due",
              refundAmountCents: overpaid * 100,
            }
          : {}),
        ...(after.bookingStatus === "cancelled"
          ? {
              reviewNote: `A Paynow payment of $${amount} arrived after this booking was cancelled. Refund it or reinstate the stay.`,
              // Staff decide the figure: the cancellation terms may keep some.
              refundStatus: "due",
              refundAmountCents: null,
            }
          : {}),
        ...(clash
          ? {
              bookingStatus: "pending",
              reviewNote: `Paid through Paynow after its payment window ran out, but ${clash.reference} has since taken these dates. Refund the guest or offer another room.`,
            }
          : wasPending
            ? { bookingStatus: "confirmed", reviewNote: null }
            : {}),
      },
    });
    return { updated, wasPending };
  });

  // Only the call whose write landed reports it.
  if (credited) {
    const { updated, wasPending } = credited;
    const event = clash ? "review" : wasPending ? "confirmed" : updated.paymentStatus === "verified" ? "paid-in-full" : null;
    if (event) await notifyBooking(booking.id, event);
    if ((updated.amountPaid > updated.totalAmount || updated.bookingStatus === "cancelled") && !clash) {
      await notifyBooking(booking.id, "review");
    }
    return updated;
  }
  return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

export type PaynowResultOutcome =
  | "confirmed"
  | "already-paid"
  | "status-recorded"
  | "unknown-booking"
  | "no-payment-started"
  | "poll-url-mismatch"
  | "amount-mismatch";

function samePollUrl(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Applies a status update Paynow POSTed to the result URL. The caller has
 * already checked its hash (verifyPaynowStatusUpdate); this checks it is
 * about a payment we actually started, for the amount we asked for, before a
 * "paid" is allowed to confirm anything.
 *
 * - The poll URL must be the one stored when the charge was started, so a
 *   validly signed update for some other transaction cannot settle this one.
 * - A paid update for the wrong amount is recorded for staff and does not
 *   confirm the stay.
 * - Everything is idempotent: Paynow retries callbacks, and the poller or a
 *   browser refresh may already have confirmed the booking. recordPaynowPaid
 *   only writes while the payment is not yet verified.
 */
export async function applyPaynowStatusUpdate(
  update: PaynowStatusUpdate,
): Promise<PaynowResultOutcome> {
  const booking = await getBookingByReference(update.reference);
  const outcome = await applyToBooking(booking, update);
  // Every authentic callback is logged, whatever became of it.
  await recordPaymentEvent({
    bookingId: booking?.id ?? null,
    source: "callback",
    reference: update.reference,
    status: update.status,
    outcome,
    amount: update.amount,
    paynowReference: update.paynowReference,
  });
  return outcome;
}

async function applyToBooking(
  booking: Booking | null,
  update: PaynowStatusUpdate,
): Promise<PaynowResultOutcome> {
  if (!booking) return "unknown-booking";
  if (!booking.paynowPollUrl) return "no-payment-started";
  if (!update.pollUrl || !samePollUrl(update.pollUrl, booking.paynowPollUrl)) {
    return "poll-url-mismatch";
  }

  const paynowReference = update.paynowReference || booking.paynowReference;

  // Nothing in flight means this charge was already credited (or never began).
  if (!chargeInFlight(booking)) return "already-paid";

  if (!isPaidStatus(update.status)) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paynowStatus: update.status, paynowReference },
    });
    return "status-recorded";
  }

  // The amount of THIS charge — a deposit, a balance or the whole stay.
  const expected = booking.paynowChargeAmount ?? booking.totalAmount - booking.amountPaid;
  const amount = Number(update.amount);
  if (!Number.isFinite(amount) || Math.abs(amount - expected) > 0.005) {
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paynowStatus: update.status,
        paynowReference,
        reviewNote: `Paynow reported ${update.amount || "an unknown amount"} paid (reference ${paynowReference ?? "unknown"}), but this charge was for ${expected}. Not credited automatically — check the payment in Paynow.`,
      },
    });
    await notifyBooking(booking.id, "review");
    return "amount-mismatch";
  }

  if (paynowReference !== booking.paynowReference) {
    await prisma.booking.update({ where: { id: booking.id }, data: { paynowReference } });
  }
  await recordPaynowPaid(booking, update.status);
  return "confirmed";
}

/** Charges older than this get asked about by the sweeper, not just the guest's page. */
const CONFIRM_AFTER_MS = 60_000;
/** Paynow abandons an unapproved charge long before this; stop asking then. */
const STOP_ASKING_AFTER_MS = 2 * 24 * 60 * 60_000;

/**
 * Asks Paynow about every charge still in flight. The guest's page and the
 * result callback normally confirm a payment within seconds, but a guest who
 * closes the page, or a callback that never arrives, must not leave a paid
 * stay unconfirmed. Runs on the sweeper's timer; returns how many it credited.
 */
export async function confirmChargesInFlight(now: Date = new Date()): Promise<number> {
  if (!isPaynowConfigured()) return 0;
  const inFlight = await prisma.booking.findMany({
    where: {
      bookingStatus: { not: "cancelled" },
      paynowPollUrl: { not: null },
      OR: [{ paynowChargeAmount: { not: null } }, { paymentStatus: "processing" }],
      paymentRequestedAt: {
        lte: new Date(now.getTime() - CONFIRM_AFTER_MS),
        gte: new Date(now.getTime() - STOP_ASKING_AFTER_MS),
      },
    },
  });
  let credited = 0;
  for (const booking of inFlight) {
    const poll = await pollGuestPayment(booking.paynowPollUrl!);
    if (!poll.ok) {
      await recordPaymentEvent({
        bookingId: booking.id,
        source: "poll",
        reference: booking.reference,
        outcome: "error",
        detail: poll.error,
      });
      continue;
    }
    if (!poll.paid) {
      if (poll.status !== booking.paynowStatus) {
        await prisma.booking.update({ where: { id: booking.id }, data: { paynowStatus: poll.status } });
      }
      continue;
    }
    console.log(`[payments] ${booking.reference}: Paynow says "${poll.status}" — credited by the sweeper`);
    await recordPaymentEvent({
      bookingId: booking.id,
      source: "poll",
      reference: booking.reference,
      status: poll.status,
      outcome: "confirmed",
    });
    await recordPaynowPaid(booking, poll.status);
    credited++;
  }
  return credited;
}

export type SweepResult = { expired: number };

/**
 * Closes "maybes" nobody paid for once their arrival day has passed:
 * relabelled expired so the dashboard's open list stays current. Silently —
 * an unpaid booking never promised the guest anything, so there is nothing
 * to tell them. Availability never waited on this: unpaid bookings hold no
 * room (occupyingBookingWhere).
 */
export async function closeUnpaidPastArrival(now: Date = new Date()): Promise<SweepResult> {
  const { count } = await prisma.booking.updateMany({
    where: {
      bookingStatus: "pending",
      paymentStatus: { notIn: ["partial", "verified"] },
      amountPaid: 0,
      paynowChargeAmount: null,
      checkIn: { lt: toStayDate(lodgeToday(now)) },
    },
    data: { bookingStatus: "expired" },
  });
  return { expired: count };
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
  /** What has been received so far, USD. */
  amountPaid: number;
  /** What secures the stay: 50%, or the whole stay when booked within 14 days. */
  depositAmount: number;
  /** Still owed on the stay. */
  balanceDue: number;
  /** YYYY-MM-DD the balance is due, or null when nothing is left. */
  balanceDueDate: string | null;
  /** What the next charge would be by default (deposit, then balance). */
  amountDueNow: number;
  /** True while a Paynow charge is waiting for the guest. */
  chargeInFlight: boolean;
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
    amountPaid: booking.amountPaid,
    depositAmount: booking.depositAmount ?? booking.totalAmount,
    balanceDue: Math.max(0, booking.totalAmount - booking.amountPaid),
    balanceDueDate: booking.balanceDueAt?.toISOString().slice(0, 10) ?? null,
    amountDueNow: amountDueNow(booking),
    chargeInFlight: chargeInFlight(booking),
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
  if (chargeInFlight(booking) && booking.paynowPollUrl && isPaynowConfigured()) {
    await checkMobileMoneyPayment(booking.reference);
    booking = await findLiveBooking(reference);
  }
  if (booking.paymentStatus === "verified") {
    throw new BookingError("That booking is already paid", "ALREADY_PAID");
  }

  await prisma.booking.update({ where: { id: booking.id }, data: { paymentMethod: method } });
  return (await getGuestBookingView(booking.reference))!;
}

export const manualPaymentMethods = ["bank_transfer", "cash"] as const;
export type ManualPaymentMethod = (typeof manualPaymentMethods)[number];

export const recordManualPaymentSchema = z.object({
  id: z.string().min(1),
  /** Whole USD received. */
  amount: z.number().int().positive().max(1_000_000),
  method: z.enum(manualPaymentMethods),
  /** The bank reference, receipt number, or who took the cash. */
  note: z.string().trim().min(1).max(300),
});

export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentSchema>;

const MANUAL_LABELS: Record<ManualPaymentMethod, string> = {
  bank_transfer: "bank transfer",
  cash: "USD cash",
};

/**
 * Records money received outside Paynow — the bank transfer and USD cash the
 * policy names. It counts like a Paynow payment: the first one confirms the
 * stay, and the stay is "verified" once fully paid. It can never take the
 * booking over its total, and an unpaid hold that lapsed is only revived if
 * the room is still free (the same rule as paying online).
 */
export async function recordManualPayment(input: RecordManualPaymentInput, by: string): Promise<Booking> {
  const data = recordManualPaymentSchema.parse(input);
  const booking = await prisma.booking.findUnique({ where: { id: data.id } });
  if (!booking) throw new BookingError("No booking with id " + data.id, "BOOKING_NOT_FOUND");
  if (booking.bookingStatus === "cancelled") {
    throw new BookingError("That booking was cancelled", "BOOKING_CANCELLED");
  }
  const outstanding = booking.totalAmount - booking.amountPaid;
  if (outstanding <= 0) throw new BookingError("That booking is already paid", "ALREADY_PAID");
  if (data.amount > outstanding) {
    throw new BookingError(
      `Only $${outstanding} is outstanding on ${booking.reference}; record at most that.`,
      "OVERPAYMENT",
    );
  }

  // Refuses (ROOM_UNAVAILABLE) if someone else has secured the dates meanwhile.
  const hold = booking.bookingStatus === "pending" || booking.bookingStatus === "expired"
    ? await holdForPayment(booking)
    : {};

  const wasPending = booking.bookingStatus !== "confirmed";
  const paid = booking.amountPaid + data.amount;
  const line = `Payment of $${data.amount} by ${MANUAL_LABELS[data.method]} recorded by ${by}: ${data.note}`;
  const count = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      // Guarded on what was paid, so two staff recording at once cannot both land.
      where: { id: booking.id, amountPaid: booking.amountPaid },
      data: {
        ...hold,
        amountPaid: paid,
        paymentStatus: paid >= booking.totalAmount ? "verified" : "partial",
        bookingStatus: "confirmed",
        verifiedBy: by,
        notes: booking.notes ? booking.notes + "\n\n" + line : line,
      },
    });
    // The receipt is issued with the payment, in the same transaction.
    if (count === 1) {
      await issueReceipt(tx, {
        booking,
        paidBefore: booking.amountPaid,
        amount: data.amount,
        method: data.method,
        source: "manual",
        note: data.note,
      });
    }
    return count;
  });
  if (count === 0) {
    throw new BookingError("That booking changed while you were recording — reload and try again.", "ALREADY_PAID");
  }

  await recordPaymentEvent({
    bookingId: booking.id,
    source: "manual",
    reference: booking.reference,
    outcome: "recorded",
    amount: String(data.amount),
    detail: `${MANUAL_LABELS[data.method]}: ${data.note}`,
  });
  await notifyBooking(
    booking.id,
    wasPending ? "confirmed" : paid >= booking.totalAmount ? "paid-in-full" : "confirmed",
  );
  return prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
}

/** Guests are reminded this many days before their balance falls due. */
export const BALANCE_REMINDER_DAYS = 3;

/**
 * Emails every guest whose balance falls due within BALANCE_REMINDER_DAYS (or
 * is already overdue) on a confirmed stay. Safe to run as often as you like:
 * each booking's reminder is one message (the outbox's unique key), so the
 * guest hears once. Returns how many reminders were newly queued.
 */
export async function sendBalanceReminders(
  now: Date = new Date(),
  /** Only these bookings — for tests, so a run never emails real guests. */
  bookingIds?: string[],
): Promise<number> {
  const horizon = toStayDate(addDays(lodgeToday(now), BALANCE_REMINDER_DAYS));
  const due = await prisma.booking.findMany({
    where: {
      ...(bookingIds ? { id: { in: bookingIds } } : {}),
      bookingStatus: "confirmed",
      paymentStatus: "partial",
      balanceDueAt: { lte: horizon },
      checkOut: { gt: now },
    },
    select: { id: true },
  });
  let queued = 0;
  for (const booking of due) {
    queued += (await notifyBooking(booking.id, "balance-reminder")) > 0 ? 1 : 0;
  }
  return queued;
}
