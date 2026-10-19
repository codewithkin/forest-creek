import { afterAll, beforeAll, expect, test } from "bun:test";

import { verifyPassword } from "better-auth/crypto";

/**
 * The root admin against the dev database. The password comes from the
 * environment, set before the validated env is first read.
 */
const PASSWORD = "root-admin-test-password";
process.env.ROOT_ADMIN_PASSWORD = PASSWORD;
// Dynamic, so nothing reads the validated env before the line above.
const { prisma } = await import("@forest-creek/db");
const { ensureRootAdmin, ROOT_ADMIN_EMAIL } = await import("./ensure-admin");

let existedBefore = false;

async function remove() {
  const user = await prisma.user.findUnique({ where: { email: ROOT_ADMIN_EMAIL } });
  if (!user) return;
  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  existedBefore = Boolean(await prisma.user.findUnique({ where: { email: ROOT_ADMIN_EMAIL } }));
  if (existedBefore) throw new Error(`${ROOT_ADMIN_EMAIL} already exists in this database; this test would not prove anything`);
});
afterAll(async () => {
  if (!existedBefore) await remove();
});

test("creates the root admin as an owner who can sign in with ROOT_ADMIN_PASSWORD", async () => {
  expect(await ensureRootAdmin()).toBe("created");
  const user = await prisma.user.findUnique({ where: { email: ROOT_ADMIN_EMAIL }, include: { accounts: true } });
  expect(user?.role).toBe("admin");
  const credential = user?.accounts.find((account) => account.providerId === "credential");
  expect(credential?.issuer).toBe("local:credential");
  expect(await verifyPassword({ hash: credential!.password!, password: PASSWORD })).toBe(true);
});

test("an existing root admin is left alone, so a changed password survives a redeploy", async () => {
  const before = await prisma.account.findFirst({ where: { user: { email: ROOT_ADMIN_EMAIL } } });
  expect(await ensureRootAdmin()).toBe("exists");
  const after = await prisma.account.findFirst({ where: { user: { email: ROOT_ADMIN_EMAIL } } });
  expect(after?.password).toBe(before?.password);
});
