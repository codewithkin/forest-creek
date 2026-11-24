import {
  addMenuTemplate,
  createMenuItem,
  createMenuSection,
  deleteMenuItem,
  deleteMenuSection,
  getMenu,
  getPublicMenus,
  menuItemProperty,
  menuItemSchema,
  menuSectionProperty,
  menuSectionSchema,
  reorderMenu,
  updateMenuItem,
  updateMenuItemSchema,
  updateMenuSection,
  updateMenuSectionSchema,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { assertPropertyAccess, publicProcedure, router, staffProcedure, type StaffScope } from "../index";

/** Every write resolves what it touches to a property first, then checks it is the caller's. */
async function assertSection(staff: StaffScope, sectionId: string) {
  const propertyId = await menuSectionProperty(sectionId);
  if (!propertyId) throw new TRPCError({ code: "NOT_FOUND", message: "That menu section no longer exists" });
  assertPropertyAccess(staff, propertyId);
  return propertyId;
}

async function assertItem(staff: StaffScope, itemId: string) {
  const propertyId = await menuItemProperty(itemId);
  if (!propertyId) throw new TRPCError({ code: "NOT_FOUND", message: "That dish or drink no longer exists" });
  assertPropertyAccess(staff, propertyId);
}

const id = z.object({ id: z.string().min(1) });

export const menuRouter = router({
  /** What guests see on /menu: every open property with something on its menu. */
  public: publicProcedure.query(() => getPublicMenus()),

  /** Everything at one property, hidden sections included, for the dashboard. */
  manage: staffProcedure.input(z.object({ propertyId: z.string().min(1) })).query(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return getMenu(input.propertyId, { includeHidden: true });
  }),

  addTemplate: staffProcedure.input(z.object({ propertyId: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return { added: await addMenuTemplate(input.propertyId) };
  }),

  createSection: staffProcedure.input(menuSectionSchema).mutation(({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    return createMenuSection(input);
  }),

  updateSection: staffProcedure.input(updateMenuSectionSchema).mutation(async ({ ctx, input }) => {
    await assertSection(ctx.staff, input.id);
    return updateMenuSection(input);
  }),

  deleteSection: staffProcedure.input(id).mutation(async ({ ctx, input }) => {
    await assertSection(ctx.staff, input.id);
    return deleteMenuSection(input.id);
  }),

  createItem: staffProcedure.input(menuItemSchema).mutation(async ({ ctx, input }) => {
    await assertSection(ctx.staff, input.sectionId);
    return createMenuItem(input);
  }),

  updateItem: staffProcedure.input(updateMenuItemSchema).mutation(async ({ ctx, input }) => {
    await assertItem(ctx.staff, input.id);
    // Moving an item to another section is a move into that section's property.
    if (input.sectionId) await assertSection(ctx.staff, input.sectionId);
    return updateMenuItem(input);
  }),

  deleteItem: staffProcedure.input(id).mutation(async ({ ctx, input }) => {
    await assertItem(ctx.staff, input.id);
    return deleteMenuItem(input.id);
  }),

  reorder: staffProcedure
    .input(
      z.union([
        z.object({ propertyId: z.string().min(1), sectionIds: z.array(z.string().min(1)).max(100) }),
        z.object({ sectionId: z.string().min(1), itemIds: z.array(z.string().min(1)).max(300) }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      if ("propertyId" in input) assertPropertyAccess(ctx.staff, input.propertyId);
      else await assertSection(ctx.staff, input.sectionId);
      await reorderMenu(input);
      return { ok: true };
    }),
});
