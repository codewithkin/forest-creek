import { z } from "zod";

import { prisma } from "./client";
import { slugSchema } from "./properties";

import type { Activity } from "../prisma/generated/client";

export type { Activity };

export const createActivitySchema = z.object({
  propertyId: z.string().min(1),
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  price: z.number().int().min(0).max(100_000),
  currency: z.string().trim().length(3).default("USD"),
  image: z.string().trim().min(1),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = createActivitySchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

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

export function getActivityBySlug(propertyId: string, slug: string): Promise<Activity | null> {
  return prisma.activity.findUnique({ where: { propertyId_slug: { propertyId, slug } } });
}

export function createActivity(input: CreateActivityInput): Promise<Activity> {
  return prisma.activity.create({ data: createActivitySchema.parse(input) });
}

export function updateActivity(input: UpdateActivityInput): Promise<Activity> {
  const { id, ...data } = updateActivitySchema.parse(input);
  return prisma.activity.update({ where: { id }, data });
}
