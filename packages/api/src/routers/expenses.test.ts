import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { prisma } from "@forest-creek/db";

import { deleteUnlocks, t } from "../index";
import { expensesRouter } from "./expenses";

/** Who may do what: a manager their own property's expenses, the owner everything and the profit & loss. */
const PREFIX = "api-expenses-test";
const createCaller = t.createCallerFactory(expensesRouter);
const callerAs = (id: string, role: "admin" | "manager") => {
  // The password asked before a delete is tested in security.test.ts.
  deleteUnlocks.unlock(`${id}-session`);
  return createCaller({ session: { user: { id, role, email: `${PREFIX}@example.com` }, session: { id: `${id}-session` } } } as unknown as Parameters<typeof createCaller>[0]);
};
const managerId = `${PREFIX}-manager`;
let propertyId: string;
let otherId: string;

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? "ERROR";
  }
}

async function cleanup() {
  await prisma.expense.deleteMany({ where: { createdBy: `${PREFIX}@example.com` } });
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.property.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
  const make = (slug: string) =>
    prisma.property.create({ data: { slug, name: slug, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 } });
  propertyId = (await make(PREFIX)).id;
  otherId = (await make(`${PREFIX}-other`)).id;
  await prisma.user.create({ data: { id: managerId, name: "Manager", email: `${managerId}@example.com`, emailVerified: true, role: "manager" } });
  await prisma.staffProperty.create({ data: { userId: managerId, propertyId } });
});
afterAll(async () => {
  await cleanup();
});

describe("expenses router", () => {
  test("a manager adds expenses for their own property only, and never sees the profit & loss", async () => {
    const manager = callerAs(managerId, "manager");
    const expense = { description: "Gas refill", amountCents: 2_500, spentOn: "2031-06-02" };
    expect(await code(manager.create({ ...expense, propertyId }))).toBe("OK");
    expect(await code(manager.create({ ...expense, propertyId: otherId }))).toBe("FORBIDDEN");
    expect(await code(manager.create({ ...expense, propertyId: null }))).toBe("FORBIDDEN");
    expect(await code(manager.profitAndLoss({ from: "2031-06", to: "2031-06" }))).toBe("FORBIDDEN");
    expect(await code(manager.renameCategory({ id: "x", name: "y" }))).toBe("FORBIDDEN");
  });

  test("the owner sees it in the profit & loss", async () => {
    const pnl = await callerAs(`${PREFIX}-owner`, "admin").profitAndLoss({ from: "2031-06", to: "2031-06", propertyId });
    expect(pnl.total.expenses).toBe(2_500);
  });
});
