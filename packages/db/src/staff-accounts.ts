import { randomUUID } from "node:crypto";

import { z } from "zod";

import { prisma } from "./client";
import { staffRoles, type StaffRole } from "./domain";

/**
 * Staff sign-in accounts, managed by the owner. better-auth signs a person in
 * with a user row plus a "credential" account row whose issuer is
 * "local:credential" and whose password is a better-auth hashPassword() hash;
 * anything else and sign-in silently fails. This file is the one place that
 * writes those rows (apps/server/src/ensure-admin.ts uses it too). Hashing
 * happens in the caller, which has better-auth: this package doesn't.
 *
 * The owner's word is final here, as asked: an email or password they set is
 * set, with no verification email and no rules beyond "not empty".
 */

export class AccountError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
  ) {
    super(message);
    this.name = "AccountError";
  }
}

/** The most a password may be: better-auth's own ceiling. */
export const MAX_PASSWORD_LENGTH = 128;

export const staffAccountSchema = z.object({
  name: z.string().trim().min(1, "Give a name").max(120),
  email: z.string().trim().toLowerCase().email("That isn't an email address").max(200),
  role: z.enum(staffRoles),
  /** For a manager: the properties they look after. An owner sees them all. */
  propertyIds: z.array(z.string().min(1)).max(100).default([]),
});

export const passwordSchema = z.string().min(1, "Enter a password").max(MAX_PASSWORD_LENGTH, `At most ${MAX_PASSWORD_LENGTH} characters`);

async function emailTaken(email: string, exceptId?: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return Boolean(user && user.id !== exceptId);
}

/** A sign-in account: the user and its credential row, together. */
export async function createAccount(input: { name: string; email: string; role: string }, passwordHash: string): Promise<string> {
  const id = randomUUID();
  await prisma.$transaction([
    prisma.user.create({ data: { id, name: input.name, email: input.email, emailVerified: true, role: input.role } }),
    prisma.account.create({
      data: { id: randomUUID(), userId: id, providerId: "credential", issuer: "local:credential", accountId: id, password: passwordHash },
    }),
  ]);
  return id;
}

/** Replaces a user's password; makes the credential row if they never had one. */
export async function setAccountPassword(userId: string, passwordHash: string): Promise<void> {
  const { count } = await prisma.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: passwordHash } });
  if (count === 0) {
    await prisma.account.create({
      data: { id: randomUUID(), userId, providerId: "credential", issuer: "local:credential", accountId: userId, password: passwordHash },
    });
  }
}

/** Everyone who can sign in to the dashboard, with the properties managers look after. */
export async function listStaffAccounts() {
  const users = await prisma.user.findMany({
    where: { role: { in: [...staffRoles] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      staffProperties: { select: { propertyId: true } },
      sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as StaffRole,
    propertyIds: user.staffProperties.map((link) => link.propertyId),
    lastSeen: user.sessions[0]?.updatedAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  }));
}

async function ownersOtherThan(userId: string): Promise<number> {
  return prisma.user.count({ where: { role: "admin", id: { not: userId } } });
}

/** A new person on the team, signing in with exactly the email and password given. */
export async function addStaffAccount(input: z.input<typeof staffAccountSchema>, passwordHash: string): Promise<string> {
  const data = staffAccountSchema.parse(input);
  if (await emailTaken(data.email)) throw new AccountError("Someone already signs in with that email", "CONFLICT");
  const id = await createAccount(data, passwordHash);
  if (data.role === "manager" && data.propertyIds.length) {
    await prisma.staffProperty.createMany({ data: data.propertyIds.map((propertyId) => ({ userId: id, propertyId })), skipDuplicates: true });
  }
  return id;
}

/**
 * Changes a person's name, email, role and properties, taking the owner's word
 * for it. Two refusals only: an email someone else signs in with, and leaving
 * the business with no owner.
 */
export async function updateStaffAccount(id: string, input: z.input<typeof staffAccountSchema>): Promise<void> {
  const data = staffAccountSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!user) throw new AccountError("No such person", "NOT_FOUND");
  if (await emailTaken(data.email, id)) throw new AccountError("Someone else already signs in with that email", "CONFLICT");
  if (user.role === "admin" && data.role !== "admin" && (await ownersOtherThan(id)) === 0) {
    throw new AccountError("There must always be at least one owner", "BAD_REQUEST");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { name: data.name, email: data.email, role: data.role, emailVerified: true } }),
    prisma.staffProperty.deleteMany({ where: { userId: id } }),
    ...(data.role === "manager" && data.propertyIds.length
      ? [prisma.staffProperty.createMany({ data: data.propertyIds.map((propertyId) => ({ userId: id, propertyId })), skipDuplicates: true })]
      : []),
  ]);
}

/**
 * Sets someone's password. Their other sessions end, so a lost phone or an
 * ex-employee is signed out everywhere; `keepSessionId` spares the owner's own.
 */
export async function changeStaffPassword(id: string, passwordHash: string, keepSessionId?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new AccountError("No such person", "NOT_FOUND");
  await setAccountPassword(id, passwordHash);
  await prisma.session.deleteMany({ where: { userId: id, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
}

/** Takes someone off the team: they can no longer sign in. Never yourself, never the last owner. */
export async function removeStaffAccount(id: string, byUserId: string): Promise<void> {
  if (id === byUserId) throw new AccountError("You can't remove yourself", "BAD_REQUEST");
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!user) throw new AccountError("No such person", "NOT_FOUND");
  if (user.role === "admin" && (await ownersOtherThan(id)) === 0) throw new AccountError("There must always be at least one owner", "BAD_REQUEST");
  // Sessions, accounts, property links and report emails cascade with the user.
  await prisma.user.delete({ where: { id } });
}
