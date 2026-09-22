import { z } from "zod";

import { prisma } from "./client";
import { syncGallery } from "./gallery";
import { slugSchema } from "./properties";

import type { Activity } from "../prisma/generated/client";

export type { Activity };

export const MAX_ACTIVITY_IMAGES = 20;

export const createActivitySchema = z.object({
  propertyId: z.string().min(1),
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  // 0 is a real, allowed price: the braai and the pool are included in a stay.
  // A "free" toggle in the dashboard just writes 0 here, so the two can never
  // disagree about what a guest owes.
  price: z.number().int().min(0).max(100_000),
  currency: z.string().trim().length(3).default("USD"),
  // Optional when images is given: the cover is then images[0].
  image: z.string().trim().min(1).optional(),
  images: z.array(z.string().trim().min(1)).min(1).max(MAX_ACTIVITY_IMAGES).optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/** What a new activity must satisfy: the base shape plus at least one photo. */
export const newActivitySchema = createActivitySchema.refine(
  (activity) => Boolean(activity.image) || Boolean(activity.images?.length),
  { message: "Add at least one photo of the experience", path: ["images"] },
);

export type CreateActivityInput = z.input<typeof createActivitySchema>;

export const updateActivitySchema = createActivitySchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export type UpdateActivityInput = z.input<typeof updateActivitySchema>;

export function getActivities(propertyId?: string, includeInactive = false): Promise<Activity[]> {
  return prisma.activity.findMany({
    where: {
      propertyId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getActivitiesByIds(ids: string[]): Promise<Activity[]> {
  return prisma.activity.findMany({
    where: { id: { in: ids }, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getActivityById(id: string): Promise<Activity | null> {
  return prisma.activity.findUnique({ where: { id } });
}

export function getActivityBySlug(propertyId: string, slug: string): Promise<Activity | null> {
  return prisma.activity.findUnique({ where: { propertyId_slug: { propertyId, slug } } });
}

export function createActivity(input: CreateActivityInput): Promise<Activity> {
  const { image, ...data } = syncGallery(newActivitySchema.parse(input));
  if (!image) throw new Error("An experience needs at least one photo");
  return prisma.activity.create({ data: { ...data, image } });
}

export function updateActivity(input: UpdateActivityInput): Promise<Activity> {
  const { id, ...data } = updateActivitySchema.parse(input);
  return prisma.activity.update({ where: { id }, data: syncGallery(data) });
}

/**
 * Unpublishing hides an experience from guests while every booking that
 * already names it keeps working — bookings snapshot activityNames, but the
 * booking form still resolves activityIds, so a row must not vanish under it.
 */
export function setActivityActive(id: string, active: boolean): Promise<Activity> {
  return prisma.activity.update({ where: { id }, data: { active } });
}

/**
 * A real delete, for an experience added by mistake. Refused once a booking
 * references it: use setActivityActive(false) for anything guests have bought.
 */
export async function deleteActivity(id: string): Promise<{ id: string }> {
  const booked = await prisma.booking.findFirst({
    where: { activityIds: { has: id } },
    select: { reference: true },
  });
  if (booked) {
    throw new ActivityInUseError(
      `Booking ${booked.reference} includes this experience. Unpublish it instead of deleting it.`,
    );
  }
  await prisma.activity.delete({ where: { id } });
  return { id };
}

export class ActivityInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityInUseError";
  }
}
