import { prisma } from "./client";

/**
 * Bookings read back to a WhatsApp guest and waiting for their confirmation
 * (see packages/ai ConfirmationGate, which owns the rules). Details are kept
 * as given, opaque here.
 */
export type StoredConfirmation = { key: string; turnId: string; details: unknown; expiresAt: Date };

/** A guest's read-backs that have not expired, oldest first. Expired ones are cleared on the way. */
export async function listPendingConfirmations(guest: string, now = new Date()): Promise<StoredConfirmation[]> {
  await prisma.pendingConfirmation.deleteMany({ where: { guest, expiresAt: { lte: now } } });
  return prisma.pendingConfirmation.findMany({
    where: { guest },
    orderBy: { createdAt: "asc" },
    select: { key: true, turnId: true, details: true, expiresAt: true },
  });
}

/**
 * Records a read-back. The same details read back again keep their first
 * turn: only a LATER turn may confirm them, and asking twice in one turn must
 * not move that turn forward.
 */
export async function addPendingConfirmation(guest: string, pending: StoredConfirmation): Promise<void> {
  await prisma.pendingConfirmation.upsert({
    where: { guest_key: { guest, key: pending.key } },
    create: { guest, key: pending.key, turnId: pending.turnId, details: pending.details as object, expiresAt: pending.expiresAt },
    update: { expiresAt: pending.expiresAt },
  });
}

/** Forgets every read-back for a guest — once one is booked, none of the others may be. */
export async function clearPendingConfirmations(guest: string): Promise<void> {
  await prisma.pendingConfirmation.deleteMany({ where: { guest } });
}
