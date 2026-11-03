import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { auth } from "@forest-creek/auth";
import { prisma } from "@forest-creek/db";

import { t } from "../index";
import { adminRouter } from "./admin";

/**
 * The owner's People section: whatever they set is so, and a password set
 * here really signs a person in (through better-auth itself). The erase is
 * tested separately against a throwaway database (erase.test.ts in
 * packages/db), never this one.
 */
const PREFIX = "api-admin-test";
const createCaller = t.createCallerFactory(adminRouter);
let ownerId: string;
let propertyId: string;

const callerAs = (id: string, role: "admin" | "manager", sessionId = `${id}-session`) =>
  createCaller({
    session: { user: { id, role, email: `${id}@example.com`, name: id }, session: { id: sessionId } },
  } as unknown as Parameters<typeof createCaller>[0]);

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { contains: PREFIX } } });
  await prisma.property.deleteMany({ where: { slug: PREFIX } });
}

/** The message a call fails with ("" if it didn't fail). */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

const signIn = (email: string, password: string) =>
  auth.api
    .signInEmail({ body: { email, password } })
    .then(() => true)
    .catch(() => false);

beforeAll(async () => {
  await cleanup();
  propertyId = (
    await prisma.property.create({
      data: { slug: PREFIX, name: PREFIX, tagline: "-", description: "-", location: "-", phone: "-", email: "-", heroImage: "/media/x.jpg", sortOrder: 999 },
    })
  ).id;
  const owner = await callerAs("bootstrap", "admin").addPerson({ name: "Owner", email: `owner-${PREFIX}@example.com`, role: "admin", password: "first-password" });
  ownerId = owner.id;
});
afterAll(cleanup);

describe("people", () => {
  test("a person added signs in with exactly that email and password, even a short one", async () => {
    const owner = callerAs(ownerId, "admin");
    const { id } = await owner.addPerson({ name: "Tendai", email: `Tendai-${PREFIX}@Example.com`, role: "manager", propertyIds: [propertyId], password: "x" });
    expect(await signIn(`tendai-${PREFIX}@example.com`, "x")).toBe(true);
    const listed = (await owner.people()).people.find((person) => person.id === id);
    expect(listed).toMatchObject({ role: "manager", propertyIds: [propertyId], email: `tendai-${PREFIX}@example.com` });
  });

  test("the owner changes someone's email and password with no verification, and their other sessions end", async () => {
    const owner = callerAs(ownerId, "admin");
    const { id } = await owner.addPerson({ name: "Rudo", email: `rudo-${PREFIX}@example.com`, role: "manager", password: "old-password" });
    expect(await signIn(`rudo-${PREFIX}@example.com`, "old-password")).toBe(true);
    expect(await prisma.session.count({ where: { userId: id } })).toBeGreaterThan(0);

    await owner.updatePerson({ id, name: "Rudo M.", email: `rudo.new-${PREFIX}@example.com`, role: "manager" });
    await owner.setPassword({ id, password: "new password 2" });

    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    expect(await signIn(`rudo-${PREFIX}@example.com`, "old-password")).toBe(false);
    expect(await signIn(`rudo.new-${PREFIX}@example.com`, "old-password")).toBe(false);
    expect(await signIn(`rudo.new-${PREFIX}@example.com`, "new password 2")).toBe(true);
  });

  test("changing your own password keeps you signed in here", async () => {
    await prisma.session.create({ data: { id: "owner-here", token: `${PREFIX}-token-1`, userId: ownerId, expiresAt: new Date(Date.now() + 86_400_000) } });
    await prisma.session.create({ data: { id: "owner-elsewhere", token: `${PREFIX}-token-2`, userId: ownerId, expiresAt: new Date(Date.now() + 86_400_000) } });
    await callerAs(ownerId, "admin", "owner-here").setPassword({ id: ownerId, password: "mine" });
    expect((await prisma.session.findMany({ where: { userId: ownerId } })).map((session) => session.id)).toEqual(["owner-here"]);
    expect(await signIn(`owner-${PREFIX}@example.com`, "mine")).toBe(true);
  });

  test("two refusals only: an email someone else uses, and no owner left; and you can't remove yourself", async () => {
    const owner = callerAs(ownerId, "admin");
    const { id } = await owner.addPerson({ name: "Chipo", email: `chipo-${PREFIX}@example.com`, role: "manager", password: "p" });
    expect(await failure(owner.updatePerson({ id, name: "Chipo", email: `tendai-${PREFIX}@example.com`, role: "manager" }))).toContain("already signs in");
    expect(await failure(owner.addPerson({ name: "Again", email: `chipo-${PREFIX}@example.com`, role: "manager", password: "p" }))).toContain("already signs in");
    expect(await failure(owner.removePerson(ownerId))).toContain("yourself");
    await owner.removePerson(id);
    expect(await prisma.user.count({ where: { id } })).toBe(0);
  });

  test("a manager can't see or change anyone", async () => {
    expect(await failure(callerAs("some-manager", "manager").people())).not.toBe("");
  });
});
