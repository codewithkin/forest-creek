import {
  countThreadsAwaitingReply,
  dateRangeSchema,
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

  kpis: staffProcedure.input(scopedRange).query(({ ctx, input }) => {
    const scope = scopeProperties(ctx.staff, input.propertyId);
    return getPropertyKpis({ from: input.from, to: input.to }, scope);
  }),

  revenueByDay: staffProcedure.input(scopedRange).query(({ ctx, input }) => {
    const scope = scopeProperties(ctx.staff, input.propertyId);
    return getRevenueByDay({ from: input.from, to: input.to }, scope);
  }),
});
