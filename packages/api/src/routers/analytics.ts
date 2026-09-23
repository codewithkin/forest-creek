import {
  countThreadsAwaitingReply,
  dateRangeSchema,
  getOperationalAlerts,
  getOpsSnapshot,
  getPropertyKpis,
  getRevenueByDay,
} from "@forest-creek/db";
import { z } from "zod";

import { router, scopeProperties, staffProcedure } from "../index";

const scopedRange = dateRangeSchema.and(
  z.object({ propertyId: z.string().min(1).optional() }),
);

export const analyticsRouter = router({
  /** Today's list of things needing a person, for the properties in scope. */
  ops: staffProcedure
    .input(z.object({ today: z.iso.date(), propertyId: z.string().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const scope = scopeProperties(ctx.staff, input.propertyId);
      const [snapshot, awaitingReply] = await Promise.all([
        getOpsSnapshot(input.today, scope),
        countThreadsAwaitingReply(scope),
      ]);
      return { ...snapshot, awaitingReply };
    }),

  /**
   * What needs a person now: stuck charges, review notes, refunds due, failed
   * emails, Paynow errors, and - for the owner only - forged callbacks.
   */
  alerts: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }).optional())
    .query(({ ctx, input }) =>
      getOperationalAlerts(scopeProperties(ctx.staff, input?.propertyId), {
        includeUnattributed: ctx.staff.propertyIds === "all",
      }),
    ),

  kpis: staffProcedure.input(scopedRange).query(({ ctx, input }) => {
    const scope = scopeProperties(ctx.staff, input.propertyId);
    return getPropertyKpis({ from: input.from, to: input.to }, scope);
  }),

  revenueByDay: staffProcedure.input(scopedRange).query(({ ctx, input }) => {
    const scope = scopeProperties(ctx.staff, input.propertyId);
    return getRevenueByDay({ from: input.from, to: input.to }, scope);
  }),
});
