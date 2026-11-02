import { getTrends, trendsInputSchema } from "@forest-creek/db";
import { z } from "zod";

import { router, scopeProperties, staffProcedure } from "../index";

export const trendsRouter = router({
  get: staffProcedure
    .input(trendsInputSchema.extend({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => getTrends({ months: input.months }, scopeProperties(ctx.staff, input.propertyId))),
});
