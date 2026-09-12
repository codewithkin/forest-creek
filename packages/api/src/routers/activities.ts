import { getActivities, getActivityBySlug } from "@forest-creek/db";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const activitiesRouter = router({
  list: publicProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }).optional())
    .query(({ input }) => getActivities(input?.propertyId)),

  bySlug: publicProcedure
    .input(z.object({ propertyId: z.string().min(1), slug: z.string().min(1) }))
    .query(({ input }) => getActivityBySlug(input.propertyId, input.slug)),
});
