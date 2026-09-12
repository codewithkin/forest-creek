import { prisma } from "./client";

import type { Activity } from "../prisma/generated/client";

export type { Activity };

export function getActivities(): Promise<Activity[]> {
  return prisma.activity.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getActivitiesByIds(ids: string[]): Promise<Activity[]> {
  return prisma.activity.findMany({
    where: { id: { in: ids }, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export function getActivityBySlug(slug: string): Promise<Activity | null> {
  return prisma.activity.findUnique({ where: { slug } });
}
