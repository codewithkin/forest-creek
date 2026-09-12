import { getAvailableRooms, getRoomById, getRoomByTier, getRooms } from "@forest-creek/db";
import { z } from "zod";

import { publicProcedure, router } from "../index";

const stayDatesSchema = z
  .object({
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
    propertyId: z.string().min(1).optional(),
  })
  .refine((dates) => dates.checkOut > dates.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  });

export const roomsRouter = router({
  list: publicProcedure
    .input(z.object({ propertyId: z.string().min(1).optional() }).optional())
    .query(({ input }) => getRooms(input?.propertyId)),

  byId: publicProcedure.input(z.string().min(1)).query(({ input }) => getRoomById(input)),

  byTier: publicProcedure
    .input(z.object({ propertyId: z.string().min(1), tier: z.string().min(1) }))
    .query(({ input }) => getRoomByTier(input.propertyId, input.tier)),

  available: publicProcedure
    .input(stayDatesSchema)
    .query(({ input }) => getAvailableRooms(input.checkIn, input.checkOut, input.propertyId)),
});
