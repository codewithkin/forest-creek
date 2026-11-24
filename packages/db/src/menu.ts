import { z } from "zod";

import { prisma } from "./client";
import { menuKinds, missingTemplateSections, type MenuKind } from "./menu-rules";

import type { MenuItem, MenuSection } from "../prisma/generated/client";

export * from "./menu-rules";
export type { MenuItem, MenuSection };

export type MenuSectionWithItems = MenuSection & { items: MenuItem[] };

export const menuSectionSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().trim().min(1, "Give the section a name").max(80),
  kind: z.enum(menuKinds).default("food"),
  note: z.string().trim().max(160).nullable().optional(),
});
export type MenuSectionInput = z.input<typeof menuSectionSchema>;

export const updateMenuSectionSchema = menuSectionSchema
  .omit({ propertyId: true })
  .partial()
  .extend({ id: z.string().min(1), active: z.boolean().optional() });

export const menuItemSchema = z.object({
  sectionId: z.string().min(1),
  name: z.string().trim().min(1, "Give the dish or drink a name").max(120),
  description: z.string().trim().max(400).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(30)).max(6).default([]),
  image: z.string().trim().min(1).nullable().optional(),
});
export type MenuItemInput = z.input<typeof menuItemSchema>;

export const updateMenuItemSchema = menuItemSchema
  .partial()
  .extend({ id: z.string().min(1), available: z.boolean().optional() });

const ordered = { orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }] };

/** One property's menu, sections in order with their items. Hidden sections only for staff. */
export function getMenu(propertyId: string, options: { includeHidden?: boolean } = {}): Promise<MenuSectionWithItems[]> {
  return prisma.menuSection.findMany({
    where: { propertyId, ...(options.includeHidden ? {} : { active: true }) },
    include: { items: ordered },
    ...ordered,
  });
}

export type PublicMenu = {
  property: { id: string; slug: string; name: string; breakfastIncluded: boolean };
  sections: MenuSectionWithItems[];
};

/** Every open property that has something on its menu, for /menu and the PDF. */
export async function getPublicMenus(): Promise<PublicMenu[]> {
  const properties = await prisma.property.findMany({
    where: { active: true },
    select: {
      id: true, slug: true, name: true, breakfastIncluded: true,
      menuSections: { where: { active: true, items: { some: {} } }, include: { items: ordered }, ...ordered },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return properties
    .filter((property) => property.menuSections.length > 0)
    .map(({ menuSections, ...property }) => ({ property, sections: menuSections }));
}

/** Which property a section belongs to — every staff write checks it. */
export async function menuSectionProperty(sectionId: string): Promise<string | null> {
  const section = await prisma.menuSection.findUnique({ where: { id: sectionId }, select: { propertyId: true } });
  return section?.propertyId ?? null;
}

export async function menuItemProperty(itemId: string): Promise<string | null> {
  const item = await prisma.menuItem.findUnique({ where: { id: itemId }, select: { section: { select: { propertyId: true } } } });
  return item?.section.propertyId ?? null;
}

async function nextSortOrder(where: { propertyId: string } | { sectionId: string }): Promise<number> {
  const last =
    "propertyId" in where
      ? await prisma.menuSection.findFirst({ where, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } })
      : await prisma.menuItem.findFirst({ where, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return (last?.sortOrder ?? -1) + 1;
}

export async function createMenuSection(input: MenuSectionInput): Promise<MenuSection> {
  const data = menuSectionSchema.parse(input);
  return prisma.menuSection.create({ data: { ...data, sortOrder: await nextSortOrder({ propertyId: data.propertyId }) } });
}

export function updateMenuSection(input: z.input<typeof updateMenuSectionSchema>): Promise<MenuSection> {
  const { id, ...data } = updateMenuSectionSchema.parse(input);
  return prisma.menuSection.update({ where: { id }, data });
}

/** A section goes with its items. */
export async function deleteMenuSection(id: string): Promise<{ id: string }> {
  await prisma.menuSection.delete({ where: { id } });
  return { id };
}

export async function createMenuItem(input: MenuItemInput): Promise<MenuItem> {
  const data = menuItemSchema.parse(input);
  return prisma.menuItem.create({ data: { ...data, sortOrder: await nextSortOrder({ sectionId: data.sectionId }) } });
}

export function updateMenuItem(input: z.input<typeof updateMenuItemSchema>): Promise<MenuItem> {
  const { id, ...data } = updateMenuItemSchema.parse(input);
  return prisma.menuItem.update({ where: { id }, data });
}

export async function deleteMenuItem(id: string): Promise<{ id: string }> {
  await prisma.menuItem.delete({ where: { id } });
  return { id };
}

/**
 * Puts a property's sections, or one section's items, in the order given.
 * Ids that are not theirs are ignored, so a stale list can't move another
 * property's menu.
 */
export async function reorderMenu(
  scope: { propertyId: string; sectionIds: string[] } | { sectionId: string; itemIds: string[] },
): Promise<void> {
  if ("propertyId" in scope) {
    await prisma.$transaction(
      scope.sectionIds.map((id, index) =>
        prisma.menuSection.updateMany({ where: { id, propertyId: scope.propertyId }, data: { sortOrder: index } }),
      ),
    );
  } else {
    await prisma.$transaction(
      scope.itemIds.map((id, index) =>
        prisma.menuItem.updateMany({ where: { id, sectionId: scope.sectionId }, data: { sortOrder: index } }),
      ),
    );
  }
}

/** Adds the template's sections a menu is missing; returns how many it added. */
export async function addMenuTemplate(propertyId: string): Promise<number> {
  const existing = await prisma.menuSection.findMany({ where: { propertyId }, select: { name: true } });
  const missing = missingTemplateSections(existing.map((section) => section.name));
  let sortOrder = await nextSortOrder({ propertyId });
  for (const section of missing) {
    await prisma.menuSection.create({ data: { propertyId, name: section.name, kind: section.kind as MenuKind, note: section.note ?? null, sortOrder: sortOrder++ } });
  }
  return missing.length;
}
