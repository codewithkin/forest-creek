import {
  BookingError,
  bookingStatusSchema,
  createBooking,
  createBookingSchema,
  getBookingById,
  getBookingByReference,
  getBookings,
  listBookingsSchema,
  paymentStatusSchema,
  setBookingStatus,
  setPaymentStatus,
} from "@forest-creek/db";
import type { BookingErrorCode } from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, publicProcedure, router } from "../index";

const errorCodes: Record<BookingErrorCode, TRPCError["code"]> = {
  ROOM_NOT_FOUND: "NOT_FOUND",
  ROOM_UNAVAILABLE: "CONFLICT",
  OVER_CAPACITY: "BAD_REQUEST",
  UNKNOWN_ACTIVITY: "BAD_REQUEST",
  REFERENCE_EXHAUSTED: "INTERNAL_SERVER_ERROR",
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

  list: adminProcedure.input(listBookingsSchema.optional()).query(({ input }) => {
    return getBookings(input ?? {});
  }),

  byId: adminProcedure.input(z.string().min(1)).query(({ input }) => getBookingById(input)),

  setStatus: adminProcedure
    .input(z.object({ id: z.string().min(1), bookingStatus: bookingStatusSchema }))
    .mutation(({ input }) => setBookingStatus(input.id, input.bookingStatus)),

  setPaymentStatus: adminProcedure
    .input(z.object({ id: z.string().min(1), paymentStatus: paymentStatusSchema }))
    .mutation(({ ctx, input }) => {
      return setPaymentStatus(input.id, input.paymentStatus, ctx.session.user.email);
    }),
});
