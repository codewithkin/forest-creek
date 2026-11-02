import { createLetter, deleteLetters, getLetter, LetterError, letterInputSchema, letterProperties, listLetters, updateLetter } from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertPropertyAccess, router, scopeProperties, staffProcedure, type StaffScope } from "../index";

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LetterError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

async function assertAccess(staff: StaffScope, ids: string[]) {
  for (const propertyId of await guarded(() => letterProperties(ids))) assertPropertyAccess(staff, propertyId);
}

export const lettersRouter = router({
  list: staffProcedure
    .input(z.object({ propertyId: z.string().min(1).optional(), search: z.string().trim().max(120).optional() }))
    .query(({ ctx, input }) => listLetters({ search: input.search }, scopeProperties(ctx.staff, input.propertyId))),

  byId: staffProcedure.input(z.string().min(1)).query(async ({ ctx, input }) => {
    const letter = await getLetter(input);
    if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "No such letter" });
    assertPropertyAccess(ctx.staff, letter.propertyId);
    return letter;
  }),

  create: staffProcedure.input(letterInputSchema).mutation(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return createLetter(input, ctx.session.user.email);
  }),

  update: staffProcedure.input(z.object({ id: z.string().min(1), letter: letterInputSchema })).mutation(async ({ ctx, input }) => {
    await assertAccess(ctx.staff, [input.id]);
    assertPropertyAccess(ctx.staff, input.letter.propertyId);
    return guarded(() => updateLetter(input.id, input.letter));
  }),

  delete: staffProcedure.input(z.array(z.string().min(1)).min(1).max(500)).mutation(async ({ ctx, input }) => {
    await assertAccess(ctx.staff, input);
    return deleteLetters(input);
  }),
});
