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
      data: { role: "admin" },
    });
    await prisma.account.updateMany({
      where: { providerId: "credential", userId: existing.id },
      data: { password: passwordHash },
    });
    console.log(`Admin ensured: ${env.ADMIN_EMAIL}`);
  } else {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        name: "Thembie",
        email: env.ADMIN_EMAIL,
        emailVerified: true,
        role: "admin",
      },
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
    console.log(`Admin created: ${env.ADMIN_EMAIL}`);
  }

  return true;
}