import { prisma } from "./client";

/**
 * The WhatsApp agent's stored pairing (see the WhatsappSession model). Opaque
 * bytes: nothing here reads or interprets them, it only keeps them so a
 * redeploy finds the session the last container saved.
 */

export type WhatsappSessionInfo = { session: string; sizeBytes: number; updatedAt: Date };

/** Prisma's Bytes wants a plain Uint8Array over an ArrayBuffer, not a Node Buffer view. */
function toBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

export async function saveWhatsappSession(session: string, data: Uint8Array): Promise<WhatsappSessionInfo> {
  const bytes = toBytes(data);
  return prisma.whatsappSession.upsert({
    where: { session },
    create: { session, data: bytes, sizeBytes: bytes.byteLength },
    update: { data: bytes, sizeBytes: bytes.byteLength },
    select: { session: true, sizeBytes: true, updatedAt: true },
  });
}

/** The stored archive, or null when this session was never saved (or was logged out). */
export async function loadWhatsappSession(session: string): Promise<Uint8Array | null> {
  const row = await prisma.whatsappSession.findUnique({ where: { session }, select: { data: true } });
  return row?.data ?? null;
}

/** When and how big the last save was — for the agent's status page, without loading the bytes. */
export function getWhatsappSessionInfo(session: string): Promise<WhatsappSessionInfo | null> {
  return prisma.whatsappSession.findUnique({
    where: { session },
    select: { session: true, sizeBytes: true, updatedAt: true },
  });
}

/** Forgets the pairing. True when there was one to forget; safe to call when there was none. */
export async function deleteWhatsappSession(session: string): Promise<boolean> {
  const { count } = await prisma.whatsappSession.deleteMany({ where: { session } });
  return count > 0;
}
