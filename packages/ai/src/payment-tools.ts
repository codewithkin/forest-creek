import {
  BookingError,
  choosePaymentMethod,
  getBookingByReference,
  getCancellationQuote,
  getDateChangeQuote,
  getGuestBookingView,
  holdHasLapsed,
  listGuestBookings,
  listReceipts,
  paymentMethods,
  type Booking,
} from "@forest-creek/db";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { GUEST_PHONE_KEY, ownBooking, readContext } from "./guest-context";
import { brand } from "./brand";
import { paymentPageUrl, policyPageUrl } from "./links";
import { toolset } from "./toolset";

/**
 * Paying, and what changing or cancelling would cost. Every figure comes from
 * packages/db — the same policy engine the payment page, the emails and the
 * dashboard use — so the assistant never does its own arithmetic about money.
 */

const reference = z.string().min(1).describe("The booking reference (it starts with FC-)");

const MOBILE_MONEY = ["ecocash", "onemoney"] as const;

/** Bookings that can no longer be paid for or changed. */
const CLOSED = new Set(["cancelled", "expired"]);

const day = (date: Date | null | undefined) => date?.toISOString().slice(0, 10) ?? null;

const notFound = () => ({
  found: false as const,
  howToReply:
    "Say no booking matches that reference, ask the guest to check it against their confirmation, and offer the reservations contact. Never write an example reference.",
});

function balanceOf(booking: Pick<Booking, "totalAmount" | "amountPaid" | "paymentStatus">): number {
  return booking.paymentStatus === "verified" ? 0 : Math.max(0, booking.totalAmount - booking.amountPaid);
}

export const listMyBookingsTool = createTool({
  id: "list-my-bookings",
  description:
    "List the bookings made from the phone this guest is messaging from — stays still to come and those that ended in the last 30 days — with each one's FC- reference, dates, status, what has been paid and what is still owed. Use when the guest talks about 'my booking' without giving a reference, has lost their reference, or wants to pay for or check on a stay they booked.",
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const phone = readContext(context, GUEST_PHONE_KEY);
    if (!phone) {
      return { ok: false as const, error: "This guest isn't known by phone here; ask for their FC- reference instead." };
    }
    const bookings = await listGuestBookings(phone);
    const now = new Date();
    return {
      ok: true as const,
      bookings: bookings.map((booking) => ({
        reference: booking.reference,
        property: booking.propertyName,
        room: booking.roomName,
        checkIn: day(booking.checkIn),
        checkOut: day(booking.checkOut),
        guests: booking.guests,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        totalAmountUsd: booking.totalAmount,
        amountPaidUsd: booking.amountPaid,
        balanceDueUsd: balanceOf(booking),
        // An unpaid hold that ran out: the dates were released.
        holdLapsed: holdHasLapsed(booking, now),
      })),
      ...(bookings.length === 0
        ? {
            howToReply:
              "No bookings were made from this number. Ask for the FC- reference from their confirmation email — they may have booked on the website or from another phone.",
          }
        : {}),
    };
  },
});

export const getPaymentDetailsTool = createTool({
  id: "get-payment-details",
  description:
    "Everything about paying for one booking: what is due now (the 50% deposit, or the balance once the deposit is in), what paying the whole stay now would be, the balance and the date it is due, whether a charge is still waiting on the guest's phone, which payment method the booking is set to, the receipts already issued, and the payment page. Use for 'how much do I owe?', 'can I pay the balance now?', 'did you get my deposit?' and 'where is my receipt?'.",
  inputSchema: z.object({ reference }),
  execute: async ({ reference: ref }) => {
    const view = await getGuestBookingView(ref);
    if (!view) return notFound();
    const receipts = await listReceipts({ reference: view.reference });
    const closed = CLOSED.has(view.bookingStatus) || view.holdLapsed;
    const nothingPaid = view.amountPaid === 0;
    const fullyPaid = view.paymentStatus === "verified" || view.balanceDue === 0;
    return {
      found: true as const,
      reference: view.reference,
      property: view.propertyName,
      room: view.roomName,
      checkIn: view.checkIn,
      checkOut: view.checkOut,
      bookingStatus: view.bookingStatus,
      paymentStatus: view.paymentStatus,
      paymentMethod: view.paymentMethod,
      totalAmountUsd: view.totalAmount,
      amountPaidUsd: view.amountPaid,
      balanceDueUsd: fullyPaid ? 0 : view.balanceDue,
      balanceDueDate: fullyPaid ? null : view.balanceDueDate,
      fullyPaid,
      dueNowUsd: closed || fullyPaid ? 0 : view.amountDueNow,
      dueNowIs: fullyPaid
        ? "nothing — the stay is paid in full"
        : nothingPaid
          ? view.amountDueNow < view.totalAmount
            ? "the 50% non-refundable deposit"
            : "the full stay (arrival is within 14 days)"
          : "the balance",
      // Only before anything is paid, and only when the deposit is less than the whole stay.
      ...(nothingPaid && !closed && view.amountDueNow < view.totalAmount ? { payInFullNowUsd: view.totalAmount } : {}),
      chargeWaitingOnPhone: view.chargeInFlight,
      canChargeFromChat: (MOBILE_MONEY as readonly string[]).includes(view.paymentMethod),
      ...(closed
        ? { closedReason: view.holdLapsed ? "The unpaid hold ran out and the dates were released." : `The booking is ${view.bookingStatus}.` }
        : {}),
      receipts: receipts.map((receipt) => ({
        number: receipt.number,
        amountUsd: receipt.amount,
        for: receipt.kindLabel,
        method: receipt.methodLabel,
        issuedOn: receipt.issuedAt.slice(0, 10),
      })),
      paymentPageUrl: paymentPageUrl(view.reference),
      howToReply:
        "Quote these amounts exactly. Receipts are PDFs downloaded from paymentPageUrl. To pay by EcoCash or OneMoney from the chat, ask which number to charge and call request-payment; for InnBucks or Visa/Mastercard, send paymentPageUrl.",
    };
  },
});

export const quoteCancellationTool = createTool({
  id: "quote-cancellation",
  description:
    "Works out, under the Booking & Cancellation Policy, what cancelling one booking today would cost: the tier that applies, the share of the stay charged, the non-refundable deposit kept, the 5% processing fee and the refund the guest would get. It cancels nothing. Use when a guest asks what cancelling would cost, how much they would get back, or what a no-show means.",
  inputSchema: z.object({
    reference,
    noShow: z.boolean().optional().describe("True only to show what not turning up (a no-show) would cost"),
  }),
  execute: async ({ reference: ref, noShow }) => {
    const booking = await getBookingByReference(ref);
    if (!booking) return notFound();
    if (booking.bookingStatus === "cancelled") {
      return {
        found: true as const,
        reference: booking.reference,
        alreadyCancelled: true as const,
        refundStatus: booking.refundStatus,
        refundUsd: booking.refundAmountCents === null ? null : booking.refundAmountCents / 100,
      };
    }
    const quote = await getCancellationQuote(booking.id, { noShow });
    return {
      found: true as const,
      reference: booking.reference,
      checkIn: day(booking.checkIn),
      season: quote.season,
      daysBeforeArrival: quote.daysBeforeArrival,
      cancellationFeePercent: quote.feePercent,
      totalAmountUsd: quote.total,
      amountPaidUsd: quote.amountPaid,
      keptUsd: quote.retained,
      processingFeeUsd: quote.processingFee,
      refundUsd: quote.refundCents / 100,
      policyUrl: policyPageUrl,
      howToReply: `Give these figures as what the policy works out to if they cancelled today; they change as arrival gets closer. You cannot cancel: the reservations team cancels and confirms the refund — ${brand.reservationsEmail} or ${brand.reservationsPhone}.`,
    };
  },
});

export const quoteDateChangeTool = createTool({
  id: "quote-date-change",
  description:
    "Checks what moving one booking to new dates would mean under the policy: whether it is the one free date change, not free (the team's call), or not permitted at all; whether the same room is available on the new dates; and the new total at today's rate. It changes nothing. Use when a guest asks to move, shorten or extend their stay.",
  inputSchema: z.object({
    reference,
    newCheckIn: z.iso.date().describe("The new arrival date, YYYY-MM-DD"),
    newCheckOut: z.iso.date().describe("The new departure date, YYYY-MM-DD"),
  }),
  execute: async ({ reference: ref, newCheckIn, newCheckOut }) => {
    if (newCheckOut <= newCheckIn) return { found: false as const, error: "The new checkout must be after the new check-in." };
    const booking = await getBookingByReference(ref);
    if (!booking) return notFound();
    if (CLOSED.has(booking.bookingStatus)) {
      return { found: true as const, reference: booking.reference, error: `That booking is ${booking.bookingStatus}, so its dates can't be moved.` };
    }
    const quote = await getDateChangeQuote(booking.id, newCheckIn, newCheckOut);
    return {
      found: true as const,
      reference: booking.reference,
      currentCheckIn: day(booking.checkIn),
      currentCheckOut: day(booking.checkOut),
      newCheckIn,
      newCheckOut,
      verdict: quote.verdict.kind,
      reason: quote.verdict.reason,
      roomAvailableOnNewDates: quote.available,
      nights: quote.nights,
      newTotalUsd: quote.newTotal,
      differenceUsd: quote.difference,
      howToReply: `You cannot change the dates yourself. Explain the verdict and reason in plain words, and say whether the room is available then. "refused" means the change counts as a cancellation; "free" and "not-free" are made by the reservations team, who confirm any price difference — ${brand.reservationsEmail} or ${brand.reservationsPhone}.`,
    };
  },
});

export const changePaymentMethodTool = createTool({
  id: "change-payment-method",
  description:
    "Switches how a booking that isn't fully paid will be paid: ecocash, onemoney, innbucks or visa (Visa/Mastercard). Only for the guest's own booking, made from this phone. Use when the guest wants to pay a different way from the one they booked with. Afterwards: for ecocash or onemoney ask which number to charge and call request-payment; for innbucks or visa send the paymentPageUrl it returns.",
  inputSchema: z.object({
    reference,
    method: z.enum(paymentMethods).describe("The payment method the guest wants to use now"),
  }),
  execute: async ({ reference: ref, method }, context) => {
    const own = await ownBooking(ref, context);
    if ("error" in own) return { ok: false as const, ...own };
    try {
      const view = await choosePaymentMethod(own.booking.reference, method);
      const page = !(MOBILE_MONEY as readonly string[]).includes(method);
      return {
        ok: true as const,
        reference: view.reference,
        paymentMethod: view.paymentMethod,
        dueNowUsd: view.amountDueNow,
        paymentPageUrl: paymentPageUrl(view.reference),
        nextStep: page
          ? "Send the guest paymentPageUrl, exactly as returned, to pay there."
          : "Ask which number to charge (it may differ from the one they message from), then call request-payment.",
      };
    } catch (error) {
      if (error instanceof BookingError) return { ok: false as const, error: error.message, code: error.code };
      throw error;
    }
  },
});

/** Read-only and keyed by reference — safe for the anonymous website concierge too. */
export const paymentReadTools = toolset([getPaymentDetailsTool, quoteCancellationTool, quoteDateChangeTool]);

/** Need the guest's phone, so WhatsApp only. */
export const guestPaymentTools = toolset([listMyBookingsTool, changePaymentMethodTool]);
