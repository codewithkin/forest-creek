import { prisma } from "./client";
import type { RoomTier } from "./domain";

import type { Room } from "../prisma/generated/client";

export type { Room };

export function getRooms(): Promise<Room[]> {
  return prisma.room.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getRoomById(id: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { id } });
}

export function getRoomByTier(tier: RoomTier): Promise<Room | null> {
  return prisma.room.findUnique({ where: { tier } });
}
