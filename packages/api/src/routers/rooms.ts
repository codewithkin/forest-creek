import { getAvailableRooms, getRoomById, getRoomByTier, getRooms, roomTierSchema } from "@forest-creek/db";
import { z } from "zod";

import { publicProcedure, router } from "../index";

const stayDatesSchema = z
  .object({
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
  })
  .refine((dates) => dates.checkOut > dates.checkIn, {
    message: "checkOut must be after checkIn",
    path: ["checkOut"],
  });

export const roomsRouter = router({
  list: publicProcedure.query(() => getRooms()),

  byId: publicProcedure.input(z.string().min(1)).query(({ input }) => getRoomById(input)),

  byTier: publicProcedure.input(roomTierSchema).query(({ input }) => getRoomByTier(input)),

  available: publicProcedure
    .input(stayDatesSchema)
    .query(({ input }) => getAvailableRooms(input.checkIn, input.checkOut)),
});
