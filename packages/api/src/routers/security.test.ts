import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createAccount, prisma } from "@forest-creek/db";
import { hashPassword } from "better-auth/crypto";

import { adminDeleteProcedure, router, staffDeleteProcedure, t } from "../index";
import { securityRouter } from "./security";

/**
 * "Just a password needed when deleting things" (the client, 2 Nov 2026):
 * every delete is refused until the signed-in person re-enters their own
 * password, then allowed for a few minutes in that session only.
 */
const PREFIX = "api-security-test";
const deletes = router({
  staffDelete: staffDeleteProcedure.mutation(() => "deleted"),
  ownerDelete: adminDeleteProcedure.mutation(() => "deleted"),
});
const callerFor = (id: string, sessionId: string) => {
  const ctx = { session: { user: { id, role: "admin", email: `${id}@example.com` }, session: { id: sessionId } } };
  return {
    security: t.createCallerFactory(securityRouter)(ctx as never),
    deletes: t.createCallerFactory(deletes)(ctx as never),
  };
};

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error) {
    const { code, message, cause } = error as { code: string; message: string; cause?: unknown };
    return { code, message, passwordRequired: cause?.constructor?.name === "PasswordRequired" };
  }
}

let ownerId: string;
const cleanup = () => prisma.user.deleteMany({ where: { email: { contains: PREFIX } } });

beforeAll(async () => {
  await cleanup();
  ownerId = await createAccount({ name: "Owner", email: `owner-${PREFIX}@example.com`, role: "admin" }, await hashPassword("right horse"));
});
afterAll(async () => {
  await cleanup();
});

describe("a password before deleting", () => {
  test("a delete without the password is refused, marked so the dashboard asks for it", async () => {
    const { deletes: calls } = callerFor(ownerId, `${PREFIX}-a`);
    expect(await refusal(calls.staffDelete())).toEqual({ code: "FORBIDDEN", message: "Enter your password to delete.", passwordRequired: true });
    expect(await refusal(calls.ownerDelete())).toMatchObject({ passwordRequired: true });
  });

  test("a wrong password unlocks nothing", async () => {
    const { security, deletes: calls } = callerFor(ownerId, `${PREFIX}-b`);
    expect(await refusal(security.confirmPassword({ password: "wrong horse" }))).toMatchObject({ code: "BAD_REQUEST", message: "That isn't your password." });
    expect(await refusal(calls.staffDelete())).toMatchObject({ passwordRequired: true });
  });

  test("the right password lets that session delete, and only that session", async () => {
    const { security, deletes: calls } = callerFor(ownerId, `${PREFIX}-c`);
    const { unlockedUntil } = await security.confirmPassword({ password: "right horse" });
    expect(new Date(unlockedUntil).getTime()).toBeGreaterThan(Date.now());
    expect(await calls.staffDelete()).toBe("deleted");
    expect(await calls.ownerDelete()).toBe("deleted");
    // The same person signed in on another device still has to enter it there.
    expect(await refusal(callerFor(ownerId, `${PREFIX}-d`).deletes.staffDelete())).toMatchObject({ passwordRequired: true });
  });

  test("guessing is cut off", async () => {
    const { security } = callerFor(ownerId, `${PREFIX}-e`);
    let last: Awaited<ReturnType<typeof refusal>> = null;
    for (let i = 0; i < 10; i++) last = await refusal(security.confirmPassword({ password: `guess ${i}` }));
    expect(last).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
