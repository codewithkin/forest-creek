import {
  getAvailableRooms,
  getRoomById,
  getRoomByTier,
  getRoomPriceCalendar,
  getRoomsWithFromPrice,
  priceCalendarSchema,
} from "@forest-creek/db";
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
    .query(({ input }) => getRoomsWithFromPrice(input?.propertyId)),

  byId: publicProcedure.input(z.string().min(1)).query(({ input }) => getRoomById(input)),

  byTier: publicProcedure
    .input(z.object({ propertyId: z.string().min(1), tier: z.string().min(1) }))
    .query(({ input }) => getRoomByTier(input.propertyId, input.tier)),

  /** Each night's price and whether it is taken, for the booking calendar. No booking details. */
  priceCalendar: publicProcedure.input(priceCalendarSchema).query(({ input }) => getRoomPriceCalendar(input)),

  available: publicProcedure
    .input(stayDatesSchema)
    .query(({ input }) => getAvailableRooms(input.checkIn, input.checkOut, input.propertyId)),
});
