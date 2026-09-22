import { z } from "zod";

import { prisma } from "./client";
import { syncGallery } from "./gallery";

import type { Room } from "../prisma/generated/client";

export type { Room };

export const MAX_ROOM_IMAGES = 20;

export const createRoomSchema = z.object({
  propertyId: z.string().min(1),
  tier: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  pricePerNight: z.number().int().positive().max(100_000),
  capacity: z.number().int().positive().max(40),
  bedType: z.string().trim().min(1).max(80),
  amenities: z.array(z.string().trim().min(1).max(80)).max(24).default([]),
  // Optional when images is given: the cover is then images[0].
  image: z.string().trim().min(1).optional(),
  images: z.array(z.string().trim().min(1)).min(1).max(MAX_ROOM_IMAGES).optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/** What a new room must satisfy: the base shape plus at least one photo. */
export const newRoomSchema = createRoomSchema.refine(
  (room) => Boolean(room.image) || Boolean(room.images?.length),
  { message: "Add at least one photo of the room", path: ["images"] },
);

export type CreateRoomInput = z.input<typeof createRoomSchema>;

export const updateRoomSchema = createRoomSchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export type UpdateRoomInput = z.input<typeof updateRoomSchema>;

export function getRooms(propertyId?: string, includeInactive = false): Promise<Room[]> {
  return prisma.room.findMany({
    where: {
      propertyId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { pricePerNight: "desc" }],
  });
}

export function getRoomById(id: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { id } });
}

export function getRoomByTier(propertyId: string, tier: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { propertyId_tier: { propertyId, tier } } });
}

export function createRoom(input: CreateRoomInput): Promise<Room> {
  const { image, ...data } = syncGallery(newRoomSchema.parse(input));
  if (!image) throw new Error("A room needs at least one photo");
  return prisma.room.create({ data: { ...data, image } });
}

export function updateRoom(input: UpdateRoomInput): Promise<Room> {
  const { id, ...data } = updateRoomSchema.parse(input);
  return prisma.room.update({ where: { id }, data: syncGallery(data) });
}

/** Rooms are retired rather than deleted, so past bookings keep their reference. */
export function setRoomActive(id: string, active: boolean): Promise<Room> {
  return prisma.room.update({ where: { id }, data: { active } });
}
