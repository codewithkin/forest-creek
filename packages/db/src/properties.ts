import { z } from "zod";

import { prisma } from "./client";

import type { Property } from "../prisma/generated/client";

export type { Property };

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens");

export const createPropertySchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  location: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email(),
  heroImage: z.string().trim().min(1),
  gallery: z.array(z.string().trim().min(1)).max(24).default([]),
  amenities: z.array(z.string().trim().min(1).max(60)).max(24).default([]),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial().extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export function getProperties(includeInactive = false): Promise<Property[]> {
  return prisma.property.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getPropertyById(id: string): Promise<Property | null> {
  return prisma.property.findUnique({ where: { id } });
}

export function getPropertyBySlug(slug: string): Promise<Property | null> {
  return prisma.property.findUnique({ where: { slug } });
}

export function createProperty(input: CreatePropertyInput): Promise<Property> {
  return prisma.property.create({ data: createPropertySchema.parse(input) });
}

export function updateProperty(input: UpdatePropertyInput): Promise<Property> {
  const { id, ...data } = updatePropertySchema.parse(input);
  return prisma.property.update({ where: { id }, data });
}

/** Properties a staff member may act on. Admins are not scoped to any subset. */
export async function getPropertyIdsForStaff(
  userId: string,
  role: string,
): Promise<string[] | "all"> {
  if (role === "admin") return "all";
  const rows = await prisma.staffProperty.findMany({
    where: { userId },
    select: { propertyId: true },
  });
  return rows.map((row) => row.propertyId);
}

export function assignStaffToProperty(userId: string, propertyId: string) {
  return prisma.staffProperty.upsert({
    where: { userId_propertyId: { userId, propertyId } },
    update: {},
    create: { userId, propertyId },
  });
}

export function removeStaffFromProperty(userId: string, propertyId: string) {
  return prisma.staffProperty.deleteMany({ where: { userId, propertyId } });
}
