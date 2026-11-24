import {
  createExpense,
  createExpenseCategory,
  deleteExpenseCategory,
  deleteExpenses,
  ExpenseError,
  expenseCategoryNameSchema,
  expenseListSchema,
  expenseSchema,
  getProfitAndLoss,
  listExpenseCategories,
  listExpenses,
  profitAndLossSchema,
  renameExpenseCategory,
  updateExpense,
  updateExpenseSchema,
  type ExpenseScope,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminDeleteProcedure, adminProcedure, router, staffDeleteProcedure, staffProcedure, type StaffScope } from "../index";

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ExpenseError) throw new TRPCError({ code: error.code, message: error.message, cause: error });
    throw error;
  }
}

/** The owner sees everything (undefined); a manager, their own properties. */
const scopeOf = (staff: StaffScope): ExpenseScope => (staff.propertyIds === "all" ? undefined : staff.propertyIds);

/**
 * Expenses (staff: a manager their own properties', the owner everything,
 * group-wide ones included) and the profit & loss (owner only: it shows wages).
 */
export const expensesRouter = router({
  list: staffProcedure.input(expenseListSchema).query(({ ctx, input }) => guarded(() => listExpenses(input, scopeOf(ctx.staff)))),
  create: staffProcedure.input(expenseSchema).mutation(({ ctx, input }) => guarded(() => createExpense(input, ctx.session.user.email, scopeOf(ctx.staff)))),
  update: staffProcedure.input(updateExpenseSchema).mutation(({ ctx, input }) => guarded(() => updateExpense(input, scopeOf(ctx.staff)))),
  delete: staffDeleteProcedure.input(z.array(z.string().min(1)).min(1).max(1000)).mutation(({ ctx, input }) => deleteExpenses(input, scopeOf(ctx.staff))),

  categories: staffProcedure.query(() => listExpenseCategories()),
  addCategory: staffProcedure.input(expenseCategoryNameSchema).mutation(({ input }) => guarded(() => createExpenseCategory(input))),
  renameCategory: adminProcedure
    .input(z.object({ id: z.string().min(1), name: expenseCategoryNameSchema }))
    .mutation(({ input }) => guarded(() => renameExpenseCategory(input.id, input.name))),
  deleteCategory: adminDeleteProcedure.input(z.string().min(1)).mutation(({ input }) => guarded(() => deleteExpenseCategory(input))),

  profitAndLoss: adminProcedure.input(profitAndLossSchema).query(({ input }) => getProfitAndLoss(input)),
});
