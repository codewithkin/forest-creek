import {
  createProperty,
  createPropertySchema,
  createRoom,
  deleteProperty,
  deleteRoom,
  getProperties,
  getPropertyById,
  getPropertyBySlug,
  getPropertyFacets,
  getRoomById,
  getRooms,
  newRoomSchema,
  PropertyInUseError,
  propertySearchSchema,
  RoomInUseError,
  searchProperties,
  setRoomActive,
  updateProperty,
  updatePropertySchema,
  updateRoom,
  updateRoomSchema,
} from "@forest-creek/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, assertPropertyAccess, publicProcedure, router, staffProcedure, type StaffScope } from "../index";

/** A room is acted on only by staff of the property it belongs to. */
async function assertRoomAccess(staff: StaffScope, id: string) {
  const room = await getRoomById(id);
  if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "No such room" });
  assertPropertyAccess(staff, room.propertyId);
  return room;
}

/** "Still in use" is the one refusal staff can act on; say it as a conflict. */
function inUseAsConflict(error: unknown): never {
  if (error instanceof RoomInUseError || error instanceof PropertyInUseError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message, cause: error });
  }
  throw error;
}

export const propertiesRouter = router({
  list: publicProcedure.query(() => getProperties()),

  /** The paginated, filterable /places listing. */
  search: publicProcedure.input(propertySearchSchema).query(({ input }) => searchProperties(input)),

  facets: publicProcedure.query(() => getPropertyFacets()),

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

  /** Owner only, like creating one: a property takes its rooms and managers with it. */
  remove: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input }) => {
    const property = await getPropertyById(input.id);
    if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "No such property" });
    try {
      return await deleteProperty(input.id);
    } catch (error) {
      inUseAsConflict(error);
    }
  }),

  rooms: staffProcedure
    .input(z.object({ propertyId: z.string().min(1) }))
    .query(({ ctx, input }) => {
      assertPropertyAccess(ctx.staff, input.propertyId);
      return getRooms(input.propertyId, true);
    }),

  createRoom: staffProcedure.input(newRoomSchema).mutation(async ({ ctx, input }) => {
    assertPropertyAccess(ctx.staff, input.propertyId);
    const property = await getPropertyById(input.propertyId);
    if (!property) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No such property" });
    }
    return createRoom(input);
  }),

  updateRoom: staffProcedure.input(updateRoomSchema).mutation(async ({ ctx, input }) => {
    await assertRoomAccess(ctx.staff, input.id);
    if (input.propertyId) assertPropertyAccess(ctx.staff, input.propertyId);
    return updateRoom(input);
  }),

  setRoomActive: staffProcedure
    .input(z.object({ id: z.string().min(1), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertRoomAccess(ctx.staff, input.id);
      return setRoomActive(input.id, input.active);
    }),

  removeRoom: staffProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    await assertRoomAccess(ctx.staff, input.id);
    try {
      return await deleteRoom(input.id);
    } catch (error) {
      inUseAsConflict(error);
    }
  }),
});
