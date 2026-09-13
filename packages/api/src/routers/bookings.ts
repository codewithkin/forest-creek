import {
  BookingError,
  bookingStatusSchema,
  checkMobileMoneyPayment,
  createBooking,
  createBookingSchema,
  getBookingById,
  getBookingByReference,
  getBookings,
  initiateMobileMoneyPayment,
  listBookingsSchema,
  paymentStatusSchema,
  setBookingStatus,
  setPaymentStatus,
} from "@forest-creek/db";
import type { BookingErrorCode } from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router, scopeProperties, staffProcedure } from "../index";

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

  byReference: publicProcedure.input(z.string().trim().min(1)).query(({ input }) => {
    return getBookingByReference(input);
  }),

  list: staffProcedure.input(listBookingsSchema.optional()).query(({ ctx, input }) => {
    // A manager's own filter can only ever narrow what their role already allows.
    const propertyIds = scopeProperties(ctx.staff, input?.propertyId);
    return getBookings({ ...(input ?? {}), propertyId: undefined, propertyIds });
  }),

  byId: staffProcedure.input(z.string().min(1)).query(({ input }) => getBookingById(input)),

  setStatus: staffProcedure
    .input(z.object({ id: z.string().min(1), bookingStatus: bookingStatusSchema }))
    .mutation(({ input }) => setBookingStatus(input.id, input.bookingStatus)),

  setPaymentStatus: staffProcedure
    .input(z.object({ id: z.string().min(1), paymentStatus: paymentStatusSchema }))
    .mutation(({ ctx, input }) => {
      return setPaymentStatus(input.id, input.paymentStatus, ctx.session.user.email);
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

  checkPayment: publicProcedure.input(z.object({ reference: z.string().trim().min(1) })).query(({ input }) => {
    return checkMobileMoneyPayment(input.reference).catch(toTRPCError);
  }),
});
