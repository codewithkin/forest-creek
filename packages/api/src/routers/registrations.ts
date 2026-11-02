import {
  createRegistration,
  deleteRegistrations,
  getRegistration,
  listRegistrations,
  listRegistrationsSchema,
  registrationDraftFromBooking,
  RegistrationError,
  registrationInputSchema,
  registrationProperties,
  registrationsForBooking,
  REGISTRATION_CONDITIONS,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertPropertyAccess, router, scopeProperties, staffProcedure, type StaffScope } from "../index";

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RegistrationError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

async function assertAccess(staff: StaffScope, ids: string[]) {
  for (const propertyId of await guarded(() => registrationProperties(ids))) assertPropertyAccess(staff, propertyId);
}

/** Guest registration cards. Staff only: they hold identity numbers, so there is no public procedure here. */
export const registrationsRouter = router({
  /** The words the guest signs under, so the screen shows exactly what is kept with the card. */
  conditions: staffProcedure.query(() => REGISTRATION_CONDITIONS),

  list: staffProcedure
    .input(listRegistrationsSchema.extend({ propertyId: z.string().min(1).optional() }))
    .query(({ ctx, input }) => {
      const { propertyId, ...filters } = input;
      return listRegistrations(filters, scopeProperties(ctx.staff, propertyId));
    }),

  byId: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    const card = await getRegistration(input);
    if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "No such registration card" });
    assertPropertyAccess(ctx.staff, card.propertyId);
    return card;
  }),

  forBooking: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    const draft = await guarded(() => registrationDraftFromBooking(input));
    assertPropertyAccess(ctx.staff, draft.propertyId);
    return { draft, cards: await registrationsForBooking(input) };
  }),

  create: staffProcedure.input(registrationInputSchema).mutation(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return guarded(() => createRegistration(input, { email: ctx.session.user.email, name: ctx.session.user.name }));
  }),

  delete: staffProcedure.input(z.array(z.string().min(1)).min(1).max(500)).mutation(async ({ ctx, input }) => {
    await assertAccess(ctx.staff, input);
    return deleteRegistrations(input);
  }),
});
