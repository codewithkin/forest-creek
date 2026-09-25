import {
  answerDayVisit,
  answerDayVisitSchema,
  createDayVisit,
  createDayVisitSchema,
  dayVisitStatuses,
  DayVisitError,
  deleteDayVisit,
  getDayVisitBookingById,
  getDayVisitById,
  getDayVisitBySlug,
  getDayVisits,
  getGuestDayVisitView,
  listDayVisitBookings,
  requestDayVisit,
  requestDayVisitSchema,
  setDayVisitActive,
  updateDayVisit,
  updateDayVisitSchema,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  assertPropertyAccess,
  publicProcedure,
  rateLimitedProcedure,
  router,
  scopeProperties,
  staffProcedure,
  type StaffScope,
} from "../index";

const MINUTE = 60_000;
// Asking needs no account, so it is limited like creating a stay.
const requestLimited = rateLimitedProcedure("day-visit", { limit: 10, windowMs: 10 * MINUTE });

const codes = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_DATE: "BAD_REQUEST",
  INVALID_STATUS: "CONFLICT",
  IN_USE: "CONFLICT",
  REFERENCE_EXHAUSTED: "INTERNAL_SERVER_ERROR",
} as const;

function toTRPCError(error: unknown): never {
  if (error instanceof DayVisitError) {
    throw new TRPCError({ code: codes[error.code], message: error.message, cause: error });
  }
  throw error;
}

async function assertVisitAccess(staff: StaffScope, id: string) {
  const visit = await getDayVisitById(id);
  if (!visit) throw new TRPCError({ code: "NOT_FOUND", message: "No such day visit" });
  assertPropertyAccess(staff, visit.propertyId);
  return visit;
}

export const dayVisitsRouter = router({
  /** What guests can ask for, across every property or one. */
  list: publicProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }).optional())
    .query(({ input }) => getDayVisits(input?.propertyId)),

  request: requestLimited.input(requestDayVisitSchema).mutation(async ({ input }) => {
    try {
      return await requestDayVisit(input);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  /** The guest-safe view: never who asked. */
  byReference: publicProcedure
    .input(z.string().trim().min(1))
    .query(({ input }) => getGuestDayVisitView(input)),

  // --- Staff: the visits on offer --------------------------------------------

  manage: staffProcedure.input(z.object({ propertyId: z.string().min(1) })).query(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return getDayVisits(input.propertyId, true);
  }),

  create: staffProcedure.input(createDayVisitSchema).mutation(async ({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    if (await getDayVisitBySlug(input.propertyId, input.slug)) {
      throw new TRPCError({ code: "CONFLICT", message: `This property already has a day visit called "${input.slug}"` });
    }
    return createDayVisit(input);
  }),

  update: staffProcedure.input(updateDayVisitSchema).mutation(async ({ ctx, input }) => {
    await assertVisitAccess(ctx.staff, input.id);
    if (input.propertyId) assertPropertyAccess(ctx.staff, input.propertyId);
    return updateDayVisit(input);
  }),

  setActive: staffProcedure
    .input(z.object({ id: z.string().min(1), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertVisitAccess(ctx.staff, input.id);
      return setDayVisitActive(input.id, input.active);
    }),

  remove: staffProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await assertVisitAccess(ctx.staff, input.id);
    try {
      return await deleteDayVisit(input.id);
    } catch (error) {
      toTRPCError(error);
    }
  }),

  // --- Staff: guests' requests ----------------------------------------------

  bookings: staffProcedure
    .input(
      z
        .object({ propertyId: z.string().min(1).optional(), status: z.enum(dayVisitStatuses).optional() })
        .optional(),
    )
    .query(({ ctx, input }) =>
      listDayVisitBookings({ propertyIds: scopeProperties(ctx.staff, input?.propertyId), status: input?.status }),
    ),

  answer: staffProcedure.input(answerDayVisitSchema).mutation(async ({ ctx, input }) => {
    const booking = await getDayVisitBookingById(input.id);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "No such day visit" });
    assertPropertyAccess(ctx.staff, booking.propertyId);
    try {
      return await answerDayVisit(input, ctx.session.user.email);
    } catch (error) {
      toTRPCError(error);
    }
  }),
});
