import { z } from "zod";

import { prisma } from "./client";
import { buildProfitAndLoss, dateMonth, expenseMethods, lodgeMonth, MAX_PNL_MONTHS, monthKeysBetween, monthSpan, type ProfitAndLoss } from "./expense-rules";
import { lodgeDayStart } from "./report-periods";
import { updatesOf } from "./update-schema";

export * from "./expense-rules";

/**
 * What the lodge spends, and the profit & loss it makes with the money taken.
 * A manager records and sees their own properties' expenses; group-wide ones
 * (no property) are the owner's. The profit & loss is the owner's: it shows
 * wages. `scope` undefined is the owner; a manager passes their property ids.
 */
export type ExpenseScope = string[] | undefined;

export class ExpenseError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN",
  ) {
    super(message);
    this.name = "ExpenseError";
  }
}

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month");

export const expenseSchema = z.object({
  /** null: the whole group's, not one property's (owner only). */
  propertyId: z.string().min(1).nullable(),
  categoryId: z.string().min(1).nullable().optional(),
  description: z.string().trim().min(1, "Say what it was for").max(200),
  amountCents: z.number().int().min(1, "Enter the amount").max(100_000_000, "That amount is too big"),
  spentOn: z.iso.date("Pick the day it was paid"),
  paidTo: z.string().trim().max(120).nullable().optional(),
  method: z.enum(expenseMethods).default("cash"),
  reference: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

export const updateExpenseSchema = updatesOf(expenseSchema).extend({ id: z.string().min(1) });

export const expenseListSchema = z.object({
  from: month,
  to: month,
  propertyId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
});

export const profitAndLossSchema = z
  .object({ from: month, to: month, propertyId: z.string().min(1).optional() })
  .refine((input) => {
    const count = monthKeysBetween(input.from, input.to).length;
    return count >= 1 && count <= MAX_PNL_MONTHS;
  }, `Pick up to ${MAX_PNL_MONTHS} months, the first before the last`);

export const expenseCategoryNameSchema = z.string().trim().min(1, "Give the category a name").max(60);

const dayOf = (date: string) => new Date(`${date}T00:00:00Z`);

/** Which property scope an expense query may cover. */
function propertyWhere(scope: ExpenseScope, propertyId?: string) {
  if (scope) {
    if (propertyId && !scope.includes(propertyId)) throw new ExpenseError("That property is not yours to view", "FORBIDDEN");
    return { propertyId: { in: propertyId ? [propertyId] : scope } };
  }
  return propertyId ? { propertyId } : {};
}

/** May this scope write an expense for that property (null = group-wide)? */
function assertCanWrite(scope: ExpenseScope, propertyId: string | null) {
  if (!scope) return;
  if (propertyId === null) throw new ExpenseError("Only the owner records expenses for the whole group", "FORBIDDEN");
  if (!scope.includes(propertyId)) throw new ExpenseError("That property is not yours to edit", "FORBIDDEN");
}

export async function listExpenses(input: z.input<typeof expenseListSchema>, scope: ExpenseScope) {
  const { from, to, propertyId, categoryId } = expenseListSchema.parse(input);
  const { start, end } = monthSpan(from, to);
  const rows = await prisma.expense.findMany({
    where: {
      ...propertyWhere(scope, propertyId),
      ...(categoryId ? { categoryId: categoryId === "none" ? null : categoryId } : {}),
      spentOn: { gte: dayOf(start), lt: dayOf(end) },
    },
    include: { category: { select: { name: true } }, property: { select: { name: true } } },
    orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
    take: 5000,
  });
  return rows.map(({ category, property, spentOn, ...expense }) => ({
    ...expense,
    spentOn: spentOn.toISOString().slice(0, 10),
    categoryName: category?.name ?? null,
    propertyName: property?.name ?? null,
  }));
}

export async function createExpense(input: ExpenseInput, createdBy: string, scope: ExpenseScope) {
  const { spentOn, ...data } = expenseSchema.parse(input);
  assertCanWrite(scope, data.propertyId);
  return prisma.expense.create({ data: { ...data, spentOn: dayOf(spentOn), createdBy } });
}

async function expenseProperty(id: string): Promise<string | null> {
  const expense = await prisma.expense.findUnique({ where: { id }, select: { propertyId: true } });
  if (!expense) throw new ExpenseError("That expense is no longer here", "NOT_FOUND");
  return expense.propertyId;
}

export async function updateExpense(input: z.input<typeof updateExpenseSchema>, scope: ExpenseScope) {
  const { id, spentOn, ...data } = updateExpenseSchema.parse(input);
  assertCanWrite(scope, await expenseProperty(id));
  if (data.propertyId !== undefined) assertCanWrite(scope, data.propertyId);
  return prisma.expense.update({ where: { id }, data: { ...data, ...(spentOn ? { spentOn: dayOf(spentOn) } : {}) } });
}

/** Deletes expenses entered by mistake; ones outside the scope are left and counted. */
export async function deleteExpenses(ids: string[], scope: ExpenseScope): Promise<{ deleted: number; skipped: number }> {
  const where = scope ? { id: { in: ids }, propertyId: { in: scope } } : { id: { in: ids } };
  const { count } = await prisma.expense.deleteMany({ where });
  return { deleted: count, skipped: ids.length - count };
}

export async function listExpenseCategories() {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { expenses: true } } } });
  return categories.map(({ _count, ...category }) => ({ ...category, expenses: _count.expenses }));
}

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.expenseCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (clash) throw new ExpenseError(`There is already a category called ${clash.name}`, "CONFLICT");
}

export async function createExpenseCategory(name: string) {
  const clean = expenseCategoryNameSchema.parse(name);
  await assertNameFree(clean);
  return prisma.expenseCategory.create({ data: { name: clean } });
}

export async function renameExpenseCategory(id: string, name: string) {
  const clean = expenseCategoryNameSchema.parse(name);
  await assertNameFree(clean, id);
  const { count } = await prisma.expenseCategory.updateMany({ where: { id }, data: { name: clean } });
  if (count === 0) throw new ExpenseError("That category is no longer here", "NOT_FOUND");
}

/** Its expenses stay, with no category. */
export async function deleteExpenseCategory(id: string): Promise<{ id: string }> {
  const { count } = await prisma.expenseCategory.deleteMany({ where: { id } });
  if (count === 0) throw new ExpenseError("That category is no longer here", "NOT_FOUND");
  return { id };
}

/**
 * The cash profit & loss for some months, the whole group's or one
 * property's. Group-wide expenses and wages (no property) count only in the
 * group's. Rules and arithmetic: expense-rules.ts.
 */
export async function getProfitAndLoss(input: z.input<typeof profitAndLossSchema>): Promise<ProfitAndLoss & { from: string; to: string; property: { id: string; name: string; location: string; phone: string; email: string } | null }> {
  const { from, to, propertyId } = profitAndLossSchema.parse(input);
  const months = monthKeysBetween(from, to);
  const { start, end } = monthSpan(from, to);
  const moments = { gte: lodgeDayStart(start), lt: lodgeDayStart(end) };
  const days = { gte: dayOf(start), lt: dayOf(end) };
  const own = propertyId ? { propertyId } : {};

  const [receipts, refunds, invoices, expenses, payslips, property] = await Promise.all([
    prisma.receipt.findMany({ where: { issuedAt: moments, booking: own }, select: { amount: true, issuedAt: true } }),
    prisma.booking.findMany({ where: { ...own, refundStatus: "refunded", refundedAt: moments }, select: { refundAmountCents: true, refundedAt: true } }),
    prisma.invoice.findMany({ where: { ...own, bookingId: null, status: { not: "void" }, paidCents: { gt: 0 }, issuedOn: days }, select: { paidCents: true, issuedOn: true } }),
    prisma.expense.findMany({ where: { ...own, spentOn: days }, select: { amountCents: true, spentOn: true, category: { select: { name: true } } } }),
    prisma.payslip.findMany({ where: { paidAt: moments, payRun: own }, select: { netCents: true, paidAt: true } }),
    propertyId ? prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, name: true, location: true, phone: true, email: true } }) : null,
  ]);

  const pnl = buildProfitAndLoss(months, {
    // Receipts are whole dollars.
    bookings: receipts.map((receipt) => ({ month: lodgeMonth(receipt.issuedAt), cents: receipt.amount * 100 })),
    refunds: refunds.map((booking) => ({ month: lodgeMonth(booking.refundedAt!), cents: booking.refundAmountCents ?? 0 })),
    invoices: invoices.map((invoice) => ({ month: dateMonth(invoice.issuedOn), cents: invoice.paidCents })),
    expenses: expenses.map((expense) => ({ month: dateMonth(expense.spentOn), cents: expense.amountCents, category: expense.category?.name ?? null })),
    wages: payslips.map((slip) => ({ month: lodgeMonth(slip.paidAt!), cents: slip.netCents })),
  });
  return { ...pnl, from, to, property };
}
