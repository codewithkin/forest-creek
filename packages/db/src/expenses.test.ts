import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { prisma } from "./client";
import {
  createExpense,
  createExpenseCategory,
  deleteExpenseCategory,
  deleteExpenses,
  getProfitAndLoss,
  listExpenses,
  renameExpenseCategory,
  updateExpense,
} from "./expenses";

/**
 * Expenses against the database, in months nothing else uses (2031), so the
 * profit & loss totals are exactly this test's. The arithmetic itself is
 * hand-counted in expense-rules.test.ts.
 */
const PREFIX = "expenses-test";
let mine: string;
let theirs: string;
let category: string;

async function cleanup() {
  await prisma.expense.deleteMany({ where: { createdBy: PREFIX } });
  await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.property.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

const property = (slug: string) =>
  prisma.property.create({
    data: { slug, name: slug, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
  });

beforeAll(async () => {
  await cleanup();
  mine = (await property(`${PREFIX}-mine`)).id;
  theirs = (await property(`${PREFIX}-theirs`)).id;
  category = (await createExpenseCategory(`${PREFIX} Fuel`)).id;
});
afterAll(async () => {
  await cleanup();
});

describe("expenses", () => {
  test("a manager records and sees only their own properties' expenses, never the group's", async () => {
    const manager = [mine];
    await createExpense({ propertyId: mine, categoryId: category, description: "Diesel", amountCents: 4_550, spentOn: "2031-03-04" }, PREFIX, manager);
    await createExpense({ propertyId: theirs, description: "Bread", amountCents: 300, spentOn: "2031-03-05" }, PREFIX, undefined);
    await createExpense({ propertyId: null, description: "Accountant", amountCents: 20_000, spentOn: "2031-03-06" }, PREFIX, undefined);

    await expect(createExpense({ propertyId: theirs, description: "x", amountCents: 1, spentOn: "2031-03-04" }, PREFIX, manager)).rejects.toThrow("not yours");
    await expect(createExpense({ propertyId: null, description: "x", amountCents: 1, spentOn: "2031-03-04" }, PREFIX, manager)).rejects.toThrow("Only the owner");

    const seen = await listExpenses({ from: "2031-03", to: "2031-03" }, manager);
    expect(seen.map((row) => row.description)).toEqual(["Diesel"]);
    expect(seen[0]).toMatchObject({ spentOn: "2031-03-04", categoryName: `${PREFIX} Fuel`, propertyName: `${PREFIX}-mine`, method: "cash" });
    expect(await listExpenses({ from: "2031-03", to: "2031-03" }, undefined)).toHaveLength(3);
    await expect(listExpenses({ from: "2031-03", to: "2031-03", propertyId: theirs }, manager)).rejects.toThrow("not yours");
  });

  test("an update changes only what it was given", async () => {
    const [diesel] = await listExpenses({ from: "2031-03", to: "2031-03", propertyId: mine }, undefined);
    const updated = await updateExpense({ id: diesel!.id, paidTo: "Puma Mutare" }, [mine]);
    expect(updated).toMatchObject({ paidTo: "Puma Mutare", amountCents: 4_550, method: "cash", categoryId: category });
  });

  test("the profit & loss: a property's own costs, plus group-wide ones only in the group's", async () => {
    const group = await getProfitAndLoss({ from: "2031-03", to: "2031-04" });
    expect(group.months.map((row) => row.expenses)).toEqual([4_550 + 300 + 20_000, 0]);
    expect(group.total).toMatchObject({ moneyIn: 0, moneyOut: 24_850, profit: -24_850 });

    const own = await getProfitAndLoss({ from: "2031-03", to: "2031-04", propertyId: mine });
    expect(own.total.expenses).toBe(4_550);
    expect(own.expensesByCategory).toEqual([{ category: `${PREFIX} Fuel`, cents: 4_550, share: 1 }]);
    expect(own.property?.name).toBe(`${PREFIX}-mine`);
  });

  test("categories: names are unique ignoring case, and deleting one keeps its expenses", async () => {
    await expect(createExpenseCategory(`${PREFIX} fuel`)).rejects.toThrow("already a category");
    await renameExpenseCategory(category, `${PREFIX} Fuel & transport`);
    await deleteExpenseCategory(category);
    const [diesel] = await listExpenses({ from: "2031-03", to: "2031-03", propertyId: mine }, undefined);
    expect(diesel).toMatchObject({ description: "Diesel", categoryId: null, categoryName: null });
  });

  test("a manager's delete leaves other properties' expenses alone", async () => {
    const all = await listExpenses({ from: "2031-03", to: "2031-03" }, undefined);
    const result = await deleteExpenses(all.map((row) => row.id), [mine]);
    expect(result).toEqual({ deleted: 1, skipped: 2 });
  });

  test("a profit & loss is at most 36 months, first month first", async () => {
    await expect(getProfitAndLoss({ from: "2031-05", to: "2031-04" })).rejects.toThrow();
    await expect(getProfitAndLoss({ from: "2028-01", to: "2031-01" })).rejects.toThrow();
  });
});
