import {
  BookingError,
  bookingStatusSchema,
  cancelBooking,
  checkMobileMoneyPayment,
  createBooking,
  createBookingSchema,
  dateRangeSchema,
  getBookingById,
  choosePaymentMethod,
  getGuestBookingView,
  getBookings,
  getRoomOccupancy,
  initiateMobileMoneyPayment,
  listBookingsSchema,
  paymentMethodSchema,
  paymentStatusSchema,
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

const errorCodes: Record<BookingErrorCode, TRPCError["code"]> = {
  ROOM_NOT_FOUND: "NOT_FOUND",
  ROOM_UNAVAILABLE: "CONFLICT",
  OVER_CAPACITY: "BAD_REQUEST",
  UNKNOWN_ACTIVITY: "BAD_REQUEST",
  REFERENCE_EXHAUSTED: "INTERNAL_SERVER_ERROR",
  BOOKING_NOT_FOUND: "NOT_FOUND",
  BOOKING_CANCELLED: "CONFLICT",
  ALREADY_PAID: "CONFLICT",
};

function toTRPCError(error: unknown): never {
  if (error instanceof BookingError) {
    throw new TRPCError({ code: errorCodes[error.code], message: error.message, cause: error });
  }
  throw error;
}

export const bookingsRouter = router({
  // Guests book anonymously, so creating and looking up a stay stays public.
  create: publicProcedure.input(createBookingSchema).mutation(async ({ input }) => {
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

  choosePaymentMethod: publicProcedure
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
    .input(z.object({ id: z.string().min(1), reason: z.string().trim().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertBookingAccess(ctx.staff, input.id);
      try {
        return await cancelBooking(input.id, ctx.session.user.email, input.reason);
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

  // Guests book anonymously, so paying for one stays public too — same trust
  // boundary as `create` and `byReference` above: the reference is the key.
  payWithMobileMoney: publicProcedure
    .input(z.object({ reference: z.string().trim().min(1), mobileMoneyNumber: z.string().trim().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await initiateMobileMoneyPayment(input.reference, input.mobileMoneyNumber);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  /**
   * InnBucks and Visa are paid on Paynow's own page, so this hands back a URL
   * rather than pushing a prompt to a phone. Public for the same reason as
   * payWithMobileMoney: guests book anonymously and the reference is the key.
   */
  startWebCheckout: publicProcedure
    .input(z.object({ reference: z.string().trim().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await startWebCheckout(input.reference);
      } catch (error) {
        toTRPCError(error);
      }
    }),

  checkPayment: publicProcedure.input(z.object({ reference: z.string().trim().min(1) })).query(({ input }) => {
    return checkMobileMoneyPayment(input.reference).catch(toTRPCError);
  }),
});
