import { env } from "@forest-creek/env/server";
import prisma from "@forest-creek/db";
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";

/**
 * Makes sure an admin account exists for ADMIN_EMAIL/ADMIN_PASSWORD, creating the user
 * and its better-auth credential row (issuer "local:credential", password hashed with
 * hashPassword) — the only way credential sign-in works. Re-running repairs: an existing
 * account is set to role admin and its password re-hashed to the current ADMIN_PASSWORD.
 *
 * Called at every server boot (apps/server/src/index.ts) and by the seed. No-op when the
 * env vars are not set, so a deployment that doesn't want a bootstrap admin just omits them.
 */
export async function ensureAdmin(): Promise<boolean> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin ensure.");
    return false;
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  const existing = await prisma.user.findUnique({ where: { email: env.ADMIN_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: env.ADMIN_EMAIL },
      // The account was once created under a staff member's first name; the
      // dashboard shows it, and the site names no individual staff.
      data: { role: "admin", ...(existing.name === "Thembie" ? { name: "Forest Creek" } : {}) },
    });
    await prisma.account.updateMany({
      where: { providerId: "credential", userId: existing.id },
      data: { password: passwordHash },
    });
    console.log(`Admin ensured: ${env.ADMIN_EMAIL}`);
  } else {
    await createAdminAccount(env.ADMIN_EMAIL, passwordHash);
    console.log(`Admin created: ${env.ADMIN_EMAIL}`);
  }

  return true;
}

/**
 * The lodge's own owner account. The email is fixed; the password comes from
 * ROOT_ADMIN_PASSWORD (set in Coolify), never from the code — the repository is
 * public. Created on every boot when missing and otherwise left alone, so a
 * password changed later is not reset by the next deploy.
 */
export const ROOT_ADMIN_EMAIL = "reservations@forestcreek.co.zw";

export async function ensureRootAdmin(): Promise<"created" | "exists" | "skipped"> {
  if (await prisma.user.findUnique({ where: { email: ROOT_ADMIN_EMAIL }, select: { id: true } })) {
    return "exists";
  }
  if (!env.ROOT_ADMIN_PASSWORD) {
    console.warn(`ROOT_ADMIN_PASSWORD not set — the root admin ${ROOT_ADMIN_EMAIL} was not created.`);
    return "skipped";
  }
  await createAdminAccount(ROOT_ADMIN_EMAIL, await hashPassword(env.ROOT_ADMIN_PASSWORD));
  console.log(`Root admin created: ${ROOT_ADMIN_EMAIL}`);
  return "created";
}

/**
 * A user plus the better-auth credential row it signs in with: issuer
 * "local:credential" and a hashPassword() hash, or sign-in silently fails.
 */
async function createAdminAccount(email: string, passwordHash: string): Promise<void> {
  const id = randomUUID();
  await prisma.user.create({
    data: { id, name: "Forest Creek", email, emailVerified: true, role: "admin" },
  });
  await prisma.account.create({
    data: {
      id: randomUUID(),
      userId: id,
      providerId: "credential",
      issuer: "local:credential",
      accountId: id,
      password: passwordHash,
    },
  });
}