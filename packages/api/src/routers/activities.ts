import { getActivities, getActivityBySlug } from "@forest-creek/db";
import { z } from "zod";

import { publicProcedure, router } from "../index";

export const activitiesRouter = router({
  list: publicProcedure.query(() => getActivities()),

  bySlug: publicProcedure.input(z.string().min(1)).query(({ input }) => getActivityBySlug(input)),
});
