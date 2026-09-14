import {
  getActivities,
  getAvailableRooms,
  getBookingByReference,
  getProperties,
  getPropertyBySlug,
  getRooms,
} from "@forest-creek/db";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const propertySlug = z
  .string()
  .min(1)
  .describe("The property's short address, e.g. forest-creek. Call list-properties first.");

/** Shared by every tool that scopes to a property, so the failure text is consistent. */
async function resolveProperty(slug: string) {
  const property = await getPropertyBySlug(slug.trim().toLowerCase());
  if (!property || !property.active) {
    const known = (await getProperties()).map((candidate) => candidate.slug).join(", ");
    return { error: `No property called "${slug}". Known properties: ${known}` } as const;
  }
  return { property } as const;
}

export const listPropertiesTool = createTool({
  id: "list-properties",
  description:
    "List the lodges in the group, with their location and the short slug every other tool needs. Call this first whenever a guest has not said which place they mean.",
  inputSchema: z.object({}),
  execute: async () => {
    const properties = await getProperties();
    return {
      properties: properties.map((property) => ({
        slug: property.slug,
        name: property.name,
        location: property.location,
        tagline: property.tagline,
      })),
    };
  },
});

export const listRoomsTool = createTool({
  id: "list-rooms",
  description:
    "List the room types at one property with nightly rate in USD, how many it sleeps, the bed setup and amenities. Use for any question about rooms or prices.",
  inputSchema: z.object({ propertySlug }),
  execute: async ({ propertySlug: slug }) => {
    const resolved = await resolveProperty(slug);
    if ("error" in resolved) return resolved;

    // Read active and inactive in one query so a lodge whose only rooms are
    // unpublished (hidden in the dashboard) reads as "nothing on sale right
    // now", not as "no rooms exist". Only the boolean is exposed — never the
    // hidden rooms themselves or how many there are.
    const all = await getRooms(resolved.property.id, true);
    if (all.length === 0) {
      return {
        property: resolved.property.name,
        rooms: [],
        hasUnpublishedRooms: false,
      };
    }
    const visible = all.filter((room) => room.active);
    return {
      property: resolved.property.name,
      rooms: visible.map((room) => ({
        tier: room.tier,
        name: room.name,
        description: room.description,
        pricePerNightUsd: room.pricePerNight,
        sleeps: room.capacity,
        bedType: room.bedType,
        amenities: room.amenities,
      })),
      hasUnpublishedRooms: visible.length < all.length,
    };
  },
});

export const listActivitiesTool = createTool({
  id: "list-activities",
  description:
    "List the experiences that can be added to a stay at one property, with the price per booking in USD.",
  inputSchema: z.object({ propertySlug }),
  execute: async ({ propertySlug: slug }) => {
    const resolved = await resolveProperty(slug);
    if ("error" in resolved) return resolved;

    const all = await getActivities(resolved.property.id, true);
    if (all.length === 0) {
      return {
        property: resolved.property.name,
        activities: [],
        hasUnpublishedActivities: false,
      };
    }
    const visible = all.filter((activity) => activity.active);
    return {
      property: resolved.property.name,
      activities: visible.map((activity) => ({
        slug: activity.slug,
        name: activity.name,
        description: activity.description,
        priceUsd: activity.price,
      })),
      hasUnpublishedActivities: visible.length < all.length,
    };
  },
});

export const checkAvailabilityTool = createTool({
  id: "check-availability",
  description:
    "Check which rooms at a property are free for a date range. Returns only rooms that can actually be booked. Always call this before telling a guest a room is available, and before creating a booking.",
  inputSchema: z.object({
    propertySlug,
    checkIn: z.iso.date().describe("Arrival date, YYYY-MM-DD"),
    checkOut: z.iso.date().describe("Departure date, YYYY-MM-DD"),
  }),
  execute: async ({ propertySlug: slug, checkIn, checkOut }) => {
    if (checkOut <= checkIn) {
      return { error: "checkOut must be a later date than checkIn" };
    }
    const resolved = await resolveProperty(slug);
    if ("error" in resolved) return resolved;

    const rooms = await getAvailableRooms(checkIn, checkOut, resolved.property.id);
    const nights = Math.round(
      (Date.parse(checkOut + "T00:00:00Z") - Date.parse(checkIn + "T00:00:00Z")) / 86_400_000,
    );

    return {
      property: resolved.property.name,
      checkIn,
      checkOut,
      nights,
      availableRooms: rooms.map((room) => ({
        tier: room.tier,
        name: room.name,
        pricePerNightUsd: room.pricePerNight,
        sleeps: room.capacity,
        totalForStayUsd: room.pricePerNight * nights,
      })),
    };
  },
});

export const lookUpBookingTool = createTool({
  id: "look-up-booking",
  description:
    "Look up an existing booking by its reference code (it starts with FC-). Use when a guest asks about a reservation they already made.",
  inputSchema: z.object({
    reference: z.string().min(1).describe("The booking reference (it starts with FC-)"),
  }),
  execute: async ({ reference }) => {
    const booking = await getBookingByReference(reference);
    if (!booking) {
      // Guidance at the point of use: asked to explain the format, the model
      // twice made up an example reference, which the grounding guard then
      // had to block — so the guest got a hand-off instead of an answer.
      return {
        found: false as const,
        howToReply:
          "Say no booking matches that reference, ask the guest to check it against their confirmation, and offer the reservations contact. Never write an example reference.",
      };
    }

    // Deliberately no email or phone: anyone holding a reference can call this.
    return {
      found: true as const,
      reference: booking.reference,
      property: booking.propertyName,
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

/** Read-only set, used by the website concierge. */
export const conciergeTools = {
  listProperties: listPropertiesTool,
  listRooms: listRoomsTool,
  listActivities: listActivitiesTool,
  checkAvailability: checkAvailabilityTool,
  lookUpBooking: lookUpBookingTool,
};
