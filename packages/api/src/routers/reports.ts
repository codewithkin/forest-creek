import { getReport, getReportSubscriptions, reportInputSchema, reportPeriods, setReportSubscription } from "@forest-creek/db";
import { z } from "zod";

import { router, scopeProperties, staffProcedure } from "../index";

export const reportsRouter = router({
  get: staffProcedure
    .input(reportInputSchema.extend({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => getReport({ period: input.period, date: input.date }, scopeProperties(ctx.staff, input.propertyId))),

  /** Which reports this person gets by email. */
  subscriptions: staffProcedure.query(({ ctx }) => getReportSubscriptions(ctx.session.user.id)),

  setSubscription: staffProcedure
    .input(z.object({ period: z.enum(reportPeriods), on: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setReportSubscription(ctx.session.user.id, input.period, input.on);
      return { ok: true };
    }),
});
