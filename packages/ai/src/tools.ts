import {
  getActivities,
  getAvailableRooms,
  getBookingByReference,
  getRooms,
} from "@forest-creek/db";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const stayDatesSchema = z.object({
  checkIn: z.iso.date().describe("Arrival date as YYYY-MM-DD"),
  checkOut: z.iso.date().describe("Departure date as YYYY-MM-DD"),
});

export const listRoomsTool = createTool({
  id: "list-rooms",
  description:
    "List every room type at the lodge with its nightly rate in USD, how many guests it sleeps, the bed configuration and its amenities. Use this for any question about rooms or prices.",
  inputSchema: z.object({}),
  execute: async () => {
    const rooms = await getRooms();
    return {
      rooms: rooms.map((room) => ({
        tier: room.tier,
        name: room.name,
        description: room.description,
        pricePerNightUsd: room.pricePerNight,
        sleeps: room.capacity,
        bedType: room.bedType,
        amenities: room.amenities,
      })),
    };
  },
});

export const listActivitiesTool = createTool({
  id: "list-activities",
  description:
    "List the experiences guests can add to a stay, with the price per booking in USD. Use this for any question about activities or things to do.",
  inputSchema: z.object({}),
  execute: async () => {
    const activities = await getActivities();
    return {
      activities: activities.map((activity) => ({
        slug: activity.slug,
        name: activity.name,
        description: activity.description,
        priceUsd: activity.price,
      })),
    };
  },
});

export const checkAvailabilityTool = createTool({
  id: "check-availability",
  description:
    "Check which room types are free for a given date range. Returns only the rooms that can actually be booked for those nights. Always call this before telling a guest a room is available.",
  inputSchema: stayDatesSchema,
  execute: async ({ checkIn, checkOut }) => {
    if (checkOut <= checkIn) {
      return { error: "checkOut must be a later date than checkIn" };
    }
    const rooms = await getAvailableRooms(checkIn, checkOut);
    return {
      checkIn,
      checkOut,
      availableRooms: rooms.map((room) => ({
        tier: room.tier,
        name: room.name,
        pricePerNightUsd: room.pricePerNight,
        sleeps: room.capacity,
      })),
    };
  },
});

export const lookUpBookingTool = createTool({
  id: "look-up-booking",
  description:
    "Look up an existing booking by its reference code, for example FC-8KD3QA. Use it when a guest asks about a reservation they already made.",
  inputSchema: z.object({
    reference: z.string().min(1).describe("The booking reference, e.g. FC-8KD3QA"),
  }),
  execute: async ({ reference }) => {
    const booking = await getBookingByReference(reference);
    if (!booking) {
      return { found: false as const };
    }
    // Deliberately no email or phone: anyone holding a reference can call this.
    return {
      found: true as const,
      reference: booking.reference,
      guestName: booking.guestName,
      roomName: booking.roomName,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      nights: booking.nights,
      guests: booking.guests,
      activities: booking.activityNames,
      totalAmountUsd: booking.totalAmount,
      bookingStatus: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
    };
  },
});

export const conciergeTools = {
  listRooms: listRoomsTool,
  listActivities: listActivitiesTool,
  checkAvailability: checkAvailabilityTool,
  lookUpBooking: lookUpBookingTool,
};
