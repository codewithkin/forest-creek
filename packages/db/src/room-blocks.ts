import { z } from "zod";

import { prisma } from "./client";

import type { RoomBlock } from "../prisma/generated/client";

export type { RoomBlock };

/**
 * Nights staff have taken off sale. Kept apart from bookings.ts's write path
 * only for size; the overlap rule is the same one stays use — a block from
 * the 10th to the 12th covers the nights of the 10th and 11th, and a guest
 * may still check out on the morning of the 10th or arrive on the 12th.
 */

export const createRoomBlockSchema = z
  .object({
    roomId: z.string().min(1),
    /** First blocked night, YYYY-MM-DD. */
    from: z.iso.date(),
    /** The morning the room opens again, YYYY-MM-DD (exclusive). */
    to: z.iso.date(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((block) => block.to > block.from, {
    message: "The block must end after it starts",
    path: ["to"],
  });

export type CreateRoomBlockInput = z.infer<typeof createRoomBlockSchema>;

/** Prisma filter for blocks covering any night in [from, to). */
export function blockOverlapWhere(from: Date, to: Date) {
  return { startDate: { lt: to }, endDate: { gt: from } };
}

export type RoomBlockView = {
  id: string;
  roomId: string;
  /** YYYY-MM-DD, first blocked night. */
  from: string;
  /** YYYY-MM-DD, the morning it opens again. */
  to: string;
  reason: string;
  createdBy: string;
};

export function toRoomBlockView(block: RoomBlock): RoomBlockView {
  return {
    id: block.id,
    roomId: block.roomId,
    from: block.startDate.toISOString().slice(0, 10),
    to: block.endDate.toISOString().slice(0, 10),
    reason: block.reason,
    createdBy: block.createdBy,
  };
}

export function getRoomBlockById(id: string) {
  return prisma.roomBlock.findUnique({ where: { id }, include: { room: { select: { propertyId: true } } } });
}

export function deleteRoomBlock(id: string): Promise<RoomBlock> {
  return prisma.roomBlock.delete({ where: { id } });
}
