import {
  createProperty,
  createPropertySchema,
  createRoom,
  createRoomSchema,
  getProperties,
  getPropertyById,
  getPropertyBySlug,
  getRooms,
  setRoomActive,
  updateProperty,
  updatePropertySchema,
  updateRoom,
  updateRoomSchema,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, assertPropertyAccess, publicProcedure, router, staffProcedure } from "../index";

export const propertiesRouter = router({
  list: publicProcedure.query(() => getProperties()),

  bySlug: publicProcedure.input(z.string().min(1)).query(({ input }) => getPropertyBySlug(input)),

  /** Everything the signed-in staff member may act on, inactive ones included. */
  mine: staffProcedure.query(async ({ ctx }) => {
    const all = await getProperties(true);
    if (ctx.staff.propertyIds === "all") return all;
    const allowed = new Set(ctx.staff.propertyIds);
    return all.filter((property) => allowed.has(property.id));
  }),

  create: adminProcedure.input(createPropertySchema).mutation(async ({ input }) => {
    const clash = await getPropertyBySlug(input.slug);
    if (clash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `A property already uses the address "${input.slug}"`,
      });
    }
    return createProperty(input);
  }),

  update: staffProcedure.input(updatePropertySchema).mutation(async ({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.id);
    return updateProperty(input);
  }),

  rooms: staffProcedure
    .input(z.object({ propertyId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      assertPropertyAccess(ctx.staff, input.propertyId);
      return getRooms(input.propertyId, true);
    }),

  createRoom: staffProcedure.input(createRoomSchema).mutation(async ({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    const property = await getPropertyById(input.propertyId);
    if (!property) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No such property" });
    }
    return createRoom(input);
  }),

  updateRoom: staffProcedure.input(updateRoomSchema).mutation(async ({ ctx, input }) => {
    if (input.propertyId) assertPropertyAccess(ctx.staff, input.propertyId);
    return updateRoom(input);
  }),

  setRoomActive: staffProcedure
    .input(z.object({ id: z.string().min(1), active: z.boolean() }))
    .mutation(({ input }) => setRoomActive(input.id, input.active)),
});
