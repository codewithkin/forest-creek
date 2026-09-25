import { getBookingById, getReceiptView, listReceipts } from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertPropertyAccess, publicProcedure, router, staffProcedure } from "../index";

/**
 * Receipts for payments received. A receipt is fetched by its own cuid — the
 * download key — which a reference alone does not give away; the payment
 * page lists them for the booking whose reference it was opened with, the
 * same trust boundary as paying for it.
 */
export const receiptsRouter = router({
  byId: publicProcedure.input(z.string().trim().min(1).max(64)).query(async ({ input }) => {
    const receipt = await getReceiptView(input);
    if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "No such receipt" });
    return receipt;
  }),

  forReference: publicProcedure
    .input(z.string().trim().min(1).max(20))
    .query(({ input }) => listReceipts({ reference: input })),

  forBooking: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    const booking = await getBookingById(input);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "No such booking" });
    assertPropertyAccess(ctx.staff, booking.propertyId);
    return listReceipts({ bookingId: input });
  }),
});
