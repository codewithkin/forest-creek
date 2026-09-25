import {
  getDayVisitBookingById,
  BookingError,
  bookingStatusSchema,
  cancelBooking,
  changeBookingDates,
  changeBookingDatesSchema,
  checkMobileMoneyPayment,
  createBooking,
  createBookingSchema,
  createRoomBlock,
  createRoomBlockSchema,
  deleteRoomBlock,
  getRoomBlockById,
  getRoomById,
  dateRangeSchema,
  getBookingById,
  getCancellationQuote,
  getDateChangeQuote,
  getBookingNotifications,
  getBookingPaymentEvents,
  getNotificationById,
  choosePaymentMethod,
  getGuestBookingView,
  getBookings,
  getRoomOccupancy,
  initiateMobileMoneyPayment,
  listBookingsSchema,
  paymentMethodSchema,
  paymentStatusSchema,
  recordManualPayment,
  recordManualPaymentSchema,
  recordRefund,
  recordRefundSchema,
  retryNotification,
  setBookingStatus,
  setPaymentStatus,
  startWebCheckout,
} from "@forest-creek/db";
import type { BookingErrorCode } from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertPropertyAccess,
  publicProcedure,
  rateLimitedProcedure,
  router,
  scopeProperties,
  staffProcedure,
  type StaffScope,
} from "../index";

/**
 * A booking id alone says nothing about who may touch it. Every staff write
 * resolves the booking first and checks its property, or a manager at one
 * house could settle or cancel another house's stays.
 */
async function assertBookingAccess(staff: StaffScope, id: string) {
  const booking = await getBookingById(id);
  if (!booking) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No such booking" });
  }
  assertPropertyAccess(staff, booking.propertyId);
  return booking;
}

const MINUTE = 60_000;

/** The booking reference in a payment call, upper-cased like the lookup is. */
const referenceOf = (input: unknown) =>
  typeof input === "object" && input !== null && "reference" in input
    ? String((input as { reference: unknown }).reference).trim().toUpperCase()
    : undefined;

// The public procedures the browser calls directly. Generous for a real guest
// (the pay page polls checkPayment every 4s), useless for a script. Charges
// are also limited per booking, so nobody can push PIN prompts at a guest's
// phone by rotating addresses.
const createLimited = rateLimitedProcedure("create", { limit: 10, windowMs: 10 * MINUTE });
const chooseLimited = rateLimitedProcedure("choose", { limit: 20, windowMs: 10 * MINUTE }, referenceOf);
const chargeLimited = rateLimitedProcedure("charge", { limit: 5, windowMs: 10 * MINUTE }, referenceOf);
const pollLimited = rateLimitedProcedure("poll", { limit: 60, windowMs: MINUTE });

const errorCodes: Record<BookingErrorCode, TRPCError["code"]> = {
  ROOM_NOT_FOUND: "NOT_FOUND",
  ROOM_UNAVAILABLE: "CONFLICT",
  OVER_CAPACITY: "BAD_REQUEST",
  UNKNOWN_ACTIVITY: "BAD_REQUEST",
  REFERENCE_EXHAUSTED: "INTERNAL_SERVER_ERROR",
  BOOKING_NOT_FOUND: "NOT_FOUND",
  BOOKING_CANCELLED: "CONFLICT",
  ALREADY_PAID: "CONFLICT",
  ROOM_BLOCKED: "CONFLICT",
  NO_REFUND_DUE: "CONFLICT",
  OVERPAYMENT: "BAD_REQUEST",
  DATE_CHANGE_REFUSED: "CONFLICT",
  DATE_CHANGE_NOT_FREE: "PRECONDITION_FAILED",
};

function toTRPCError(error: unknown): never {
  if (error instanceof BookingError) {
    throw new TRPCError({ code: errorCodes[error.code], message: error.message, cause: error });
  }
  throw error;
}

export const bookingsRouter = router({
  // Guests book anonymously, so creating and looking up a stay stays public.
  // The website form must carry the guest's agreement to the Booking &
  // Cancellation Policy; it is recorded on the booking with the time.
  create: createLimited
    .input(
      createBookingSchema.extend({
        policyAccepted: z.literal(true, {
          error: "Please agree to the Booking & Cancellation Policy to book.",
        }),
      }),
    )
    .mutation(async ({ input }) => {
    try {
      return await createBooking(input);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  // Public, so it returns the guest-safe view only: a reference is shared
  // too freely to hand back the guest's email, phone or notes with it.
  byReference: publicProcedure.input(z.string().trim().min(1)).query(({ input }) => {
    return getGuestBookingView(input);
  }),

  choosePaymentMethod: chooseLimited
    .input(z.object({ reference: z.string().trim().min(1), method: paymentMethodSchema }))
    .mutation(async ({ input }) => {
      try {
        return await choosePaymentMethod(input.reference, input.method);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  list: staffProcedure.input(listBookingsSchema.optional()).query(({ ctx, input }) => {
    // A manager's own filter can only ever narrow what their role already allows.
    const propertyIds = scopeProperties(ctx.staff, input?.propertyId);
    return getBookings({ ...(input ?? {}), propertyId: undefined, propertyIds });
  }),

  byId: staffProcedure
    .input(z.string().min(1))
    .query(({ ctx, input }) => assertBookingAccess(ctx.staff, input)),

  setStatus: staffProcedure
    .input(z.object({ id: z.string().min(1), bookingStatus: bookingStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertBookingAccess(ctx.staff, input.id);
      return setBookingStatus(input.id, input.bookingStatus);
    }),

  setPaymentStatus: staffProcedure
    .input(z.object({ id: z.string().min(1), paymentStatus: paymentStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      await assertBookingAccess(ctx.staff, input.id);
      return setPaymentStatus(input.id, input.paymentStatus, ctx.session.user.email);
    }),

  /**
   * Releases the room. Availability is derived from non-cancelled bookings, so
   * the public calendar, the booking form and the concierge all follow from
   * this one write — no database surgery, which is what the team was asking
   * for when rooms stayed "occupied" with nobody in them.
   */
  cancel: staffProcedure
    .input(
      z.object({
        id: z.string().min(1),
        reason: z.string().trim().max(500).optional(),
        /** The guest never arrived: charged as a cancellation on the day. */
        noShow: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertBookingAccess(ctx.staff, input.id);
      try {
        return await cancelBooking(input.id, ctx.session.user.email, input.reason, {
          noShow: input.noShow,
        });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  /** What cancelling now would keep and refund under the policy — shown before staff confirm. */
  cancellationQuote: staffProcedure
    .input(z.object({ id: z.string().min(1), noShow: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      await assertBookingAccess(ctx.staff, input.id);
      return getCancellationQuote(input.id, { noShow: input.noShow });
    }),

  /** Money received outside Paynow: the bank transfer and USD cash the policy names. */
  recordPayment: staffProcedure.input(recordManualPaymentSchema).mutation(async ({ ctx, input }) => {
    await assertBookingAccess(ctx.staff, input.id);
    try {
      return await recordManualPayment(input, ctx.session.user.email);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  /** Whether new dates are free, what they would cost, and whether the change is free under clause 4. */
  dateChangeQuote: staffProcedure
    .input(z.object({ id: z.string().min(1), checkIn: z.iso.date(), checkOut: z.iso.date() }))
    .query(async ({ ctx, input }) => {
      await assertBookingAccess(ctx.staff, input.id);
      return getDateChangeQuote(input.id, input.checkIn, input.checkOut);
    }),

  changeDates: staffProcedure.input(changeBookingDatesSchema).mutation(async ({ ctx, input }) => {
    await assertBookingAccess(ctx.staff, input.id);
    try {
      return await changeBookingDates(input, ctx.session.user.email);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  /**
   * Records what was done about a refund owed on a cancelled paid booking.
   * The money itself moves outside the app (Paynow has no refund call); this
   * is the record, and it emails the guest.
   */
  recordRefund: staffProcedure.input(recordRefundSchema).mutation(async ({ ctx, input }) => {
    await assertBookingAccess(ctx.staff, input.id);
    try {
      return await recordRefund(input, ctx.session.user.email);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  /** Which rooms are taken across a window — what the availability calendar draws. */
  occupancy: staffProcedure
    // dateRangeSchema carries a refine, so it cannot be extended — it is
    // composed instead, which keeps the "to must be after from" check.
    .input(z.object({ propertyId: z.string().min(1), range: dateRangeSchema }))
    .query(({ ctx, input }) => {
      assertPropertyAccess(ctx.staff, input.propertyId);
      return getRoomOccupancy(input.propertyId, input.range);
    }),

  /**
   * Takes a room's nights off sale. Refused over a guest's booking, so staff
   * cancel that first (and the guest hears about it) rather than a block
   * quietly stranding them.
   */
  blockDates: staffProcedure.input(createRoomBlockSchema).mutation(async ({ ctx, input }) => {
    const room = await getRoomById(input.roomId);
    if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "No such room" });
    assertPropertyAccess(ctx.staff, room.propertyId);
    try {
      return await createRoomBlock(input, ctx.session.user.email);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  /** Puts blocked nights back on sale. */
  unblockDates: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    const block = await getRoomBlockById(input);
    if (!block) throw new TRPCError({ code: "NOT_FOUND", message: "No such block" });
    assertPropertyAccess(ctx.staff, block.room.propertyId);
    return deleteRoomBlock(input);
  }),

  // Guests book anonymously, so paying for one stays public too — same trust
  // boundary as `create` and `byReference` above: the reference is the key.
  payWithMobileMoney: chargeLimited
    .input(
      z.object({
        reference: z.string().trim().min(1),
        mobileMoneyNumber: z.string().trim().min(1),
        /** Pay the whole stay now instead of the 50% deposit. */
        payInFull: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        return await initiateMobileMoneyPayment(input.reference, input.mobileMoneyNumber, {
          payInFull: input.payInFull,
        });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  /**
   * InnBucks and Visa are paid on Paynow's own page, so this hands back a URL
   * rather than pushing a prompt to a phone. Public for the same reason as
   * payWithMobileMoney: guests book anonymously and the reference is the key.
   */
  startWebCheckout: chargeLimited
    .input(z.object({ reference: z.string().trim().min(1), payInFull: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      try {
        return await startWebCheckout(input.reference, { payInFull: input.payInFull });
      } catch (error) {
        toTRPCError(error);
      }
    }),

  /** Every email this booking produced and what became of it. */
  notifications: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    await assertBookingAccess(ctx.staff, input);
    return getBookingNotifications(input);
  }),

  /** What Paynow told us about this booking, callback by callback. */
  paymentEvents: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    await assertBookingAccess(ctx.staff, input);
    return getBookingPaymentEvents(input);
  }),

  /** Puts a failed or skipped email back in the queue; the worker sends it within a minute. */
  retryNotification: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    const notification = await getNotificationById(input);
    if (!notification) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No such email" });
    }
    if (notification.bookingId) {
      await assertBookingAccess(ctx.staff, notification.bookingId);
    } else {
      // An email about a day visit: its property decides who may resend it.
      const visit = notification.dayVisitBookingId ? await getDayVisitBookingById(notification.dayVisitBookingId) : null;
      if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "No such email" });
      assertPropertyAccess(ctx.staff, visit.propertyId);
    }
    return retryNotification(input);
  }),

  /**
   * Asks Paynow again about a charge — for a guest who says they paid while
   * the booking still reads "Charge sent". Only Paynow saying paid can confirm
   * it, exactly as when the guest's own page polls: staff can prompt the
   * question but cannot supply the answer.
   */
  reconcile: staffProcedure.input(z.string().min(1)).mutation(async ({ ctx, input }) => {
    const booking = await assertBookingAccess(ctx.staff, input);
    try {
      return await checkMobileMoneyPayment(booking.reference);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  checkPayment: pollLimited.input(z.object({ reference: z.string().trim().min(1) })).query(({ input }) => {
    return checkMobileMoneyPayment(input.reference).catch(toTRPCError);
  }),
});
