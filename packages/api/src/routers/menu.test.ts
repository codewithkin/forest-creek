import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { prisma } from "@forest-creek/db";

import { deleteUnlocks, t } from "../index";

/** These tests are about who may act; the password asked before a delete is tested in security.test.ts. */
const passwordEntered = (id: string) => {
  deleteUnlocks.unlock(`${id}-session`);
  return `${id}-session`;
};
import { menuRouter } from "./menu";

const PREFIX = "api-menu-test";
const createCaller = t.createCallerFactory(menuRouter);
const callerAs = (id: string, role: "admin" | "manager") =>
  createCaller({ session: { user: { id, role, email: `${id}@example.com` }, session: { id: passwordEntered(id) } } } as unknown as Parameters<typeof createCaller>[0]);
const anonymous = () => createCaller({ session: null } as unknown as Parameters<typeof createCaller>[0]);
const managerId = `${PREFIX}-manager`;
let propertyId: string;

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { id: managerId } });
  await prisma.property.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  await cleanup();
  const base = { tagline: "-", description: "-", location: "-", phone: "-", email: "m@example.com", heroImage: "/media/x.jpg", sortOrder: 999 };
  propertyId = (await prisma.property.create({ data: { ...base, slug: PREFIX, name: "Menu Lodge" } })).id;
  const other = await prisma.property.create({ data: { ...base, slug: `${PREFIX}-other`, name: "Other Lodge" } });
  await prisma.user.create({ data: { id: managerId, name: "M", email: `${managerId}@example.com`, role: "manager" } });
  await prisma.staffProperty.create({ data: { userId: managerId, propertyId: other.id } });
});
afterAll(cleanup);

describe("menu", () => {
  test("staff build a menu; a manager of another property can't read or touch it", async () => {
    const owner = callerAs("owner", "admin");
    const section = await owner.createSection({ propertyId, name: "Mains", kind: "food" });
    const item = await owner.createItem({ sectionId: section.id, name: "Sadza & beef stew", priceCents: 900 });

    const stranger = callerAs(managerId, "manager");
    expect(await code(stranger.manage({ propertyId }))).toBe("FORBIDDEN");
    expect(await code(stranger.updateItem({ id: item.id, priceCents: 1 }))).toBe("FORBIDDEN");
    expect(await code(stranger.deleteSection({ id: section.id }))).toBe("FORBIDDEN");
    expect(await code(anonymous().manage({ propertyId }))).toBe("UNAUTHORIZED");

    const shown = (await anonymous().public()).find((menu) => menu.property.id === propertyId);
    expect(shown?.sections[0]?.items[0]).toMatchObject({ name: "Sadza & beef stew", priceCents: 900 });
  });
});
