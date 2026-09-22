import {
  ActivityInUseError,
  createActivity,
  deleteActivity,
  getActivities,
  getActivityById,
  getActivityBySlug,
  newActivitySchema,
  setActivityActive,
  updateActivity,
  updateActivitySchema,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertPropertyAccess, publicProcedure, router, staffProcedure } from "../index";

/** Staff write through the property, so every mutation checks that property. */
async function assertActivityAccess(
  staff: Parameters<typeof assertPropertyAccess>[0],
  id: string,
) {
  const activity = await getActivityById(id);
  if (!activity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No such experience" });
  }
  assertPropertyAccess(staff, activity.propertyId);
  return activity;
}

export const activitiesRouter = router({
  list: publicProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }).optional())
    .query(({ input }) => getActivities(input?.propertyId)),

  bySlug: publicProcedure
    .input(z.object({ propertyId: z.string().min(1), slug: z.string().min(1) }))
    .query(({ input }) => getActivityBySlug(input.propertyId, input.slug)),

  /** Everything at one property, unpublished rows included, for the dashboard. */
  manage: staffProcedure
    .input(z.object({ propertyId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      assertPropertyAccess(ctx.staff, input.propertyId);
      return getActivities(input.propertyId, true);
    }),

  create: staffProcedure.input(newActivitySchema).mutation(async ({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    const clash = await getActivityBySlug(input.propertyId, input.slug);
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `This property already has an experience called "${input.slug}"`,
      });
    }
    return createActivity(input);
  }),

  update: staffProcedure.input(updateActivitySchema).mutation(async ({ ctx, input }) => {
    await assertActivityAccess(ctx.staff, input.id);
    if (input.propertyId) assertPropertyAccess(ctx.staff, input.propertyId);
    return updateActivity(input);
  }),

  setActive: staffProcedure
    .input(z.object({ id: z.string().min(1), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertActivityAccess(ctx.staff, input.id);
      return setActivityActive(input.id, input.active);
    }),

  remove: staffProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertActivityAccess(ctx.staff, input.id);
      try {
        return await deleteActivity(input.id);
      } catch (error) {
        if (error instanceof ActivityInUseError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message, cause: error });
        }
        throw error;
      }
    }),
});
