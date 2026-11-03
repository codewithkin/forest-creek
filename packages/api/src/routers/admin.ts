import {
  AccountError,
  addStaffAccount,
  changeStaffPassword,
  deleteObjects,
  eraseInputSchema,
  eraseOperationalData,
  listStaffAccounts,
  passwordSchema,
  removeStaffAccount,
  staffAccountSchema,
  updateStaffAccount,
} from "@forest-creek/db";
import { deleteStoredFile, isStorageConfigured } from "@forest-creek/storage";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import { adminProcedure, router } from "../index";

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AccountError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

/**
 * The owner's settings: the team's sign-in accounts, and erasing the
 * business's records to start over. Owner only (adminProcedure).
 */
export const adminRouter = router({
  people: adminProcedure.query(async ({ ctx }) => ({ me: ctx.session.user.id, people: await listStaffAccounts() })),

  addPerson: adminProcedure.input(staffAccountSchema.extend({ password: passwordSchema })).mutation(async ({ input }) => {
    const { password, ...account } = input;
    return guarded(async () => ({ id: await addStaffAccount(account, await hashPassword(password)) }));
  }),

  /** Name, email, role and properties, exactly as the owner enters them: no verification email. */
  updatePerson: adminProcedure.input(staffAccountSchema.extend({ id: z.string().min(1) })).mutation(({ input }) => {
    const { id, ...account } = input;
    return guarded(async () => {
      await updateStaffAccount(id, account);
      return { ok: true };
    });
  }),

  /** Sets anyone's password, the owner's own included. Their other sessions end; the owner stays signed in here. */
  setPassword: adminProcedure.input(z.object({ id: z.string().min(1), password: passwordSchema })).mutation(({ ctx, input }) =>
    guarded(async () => {
      await changeStaffPassword(input.id, await hashPassword(input.password), input.id === ctx.session.user.id ? ctx.session.session.id : undefined);
      return { ok: true };
    }),
  ),

  removePerson: adminProcedure.input(z.string().min(1)).mutation(({ ctx, input }) =>
    guarded(async () => {
      await removeStaffAccount(input, ctx.session.user.id);
      return { ok: true };
    }),
  ),

  /**
   * Erases bookings and the records around them, to start over. The records
   * go in one transaction; stored files leave R2 afterwards, and a file that
   * won't delete is only an orphan in the bucket, never a broken record.
   */
  erase: adminProcedure.input(eraseInputSchema).mutation(async ({ ctx, input }) => {
    const { counts, fileKeys } = await eraseOperationalData(input);
    const objects = fileKeys.length && isStorageConfigured() ? await deleteObjects(fileKeys, deleteStoredFile) : { deleted: 0, failed: 0 };
    console.warn(`[admin] operational data erased by ${ctx.session.user.email}: ${JSON.stringify(counts)}`);
    return { counts, filesRemoved: objects.deleted, filesLeftInStorage: objects.failed };
  }),
});
