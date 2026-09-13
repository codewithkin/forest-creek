import {
  BookingError,
  createBooking,
  getActivities,
  getPropertyBySlug,
  getRoomByTier,
  paymentMethods,
  requestPayment,
} from "@forest-creek/db";
import { randomUUID } from "node:crypto";

import { RequestContext } from "@mastra/core/di";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { bookingDetailsKey, ConfirmationGate } from "./confirmation";

/**
 * The guest's own WhatsApp number, injected per request by the handler. It is
 * never a tool input, so the model cannot invent or substitute someone else's.
 */
export const GUEST_PHONE_KEY = "guestPhone";
export const CHANNEL_KEY = "channel";
/** One id per agent run, which is one guest message. */
export const TURN_KEY = "turnId";

/**
 * Builds the per-request context a booking run needs. Exported so callers do
 * not have to depend on Mastra directly.
 */
export function buildGuestContext(guest: {
  phone: string;
  channel: "web" | "whatsapp";
  turnId?: string;
}) {
  return new RequestContext([
    [GUEST_PHONE_KEY, guest.phone],
    [CHANNEL_KEY, guest.channel],
    [TURN_KEY, guest.turnId ?? randomUUID()],
  ]);
}

/** Read-backs waiting for the guest's reply; see ConfirmationGate. */
const confirmations = new ConfirmationGate();

function readContext(context: unknown, key: string): string | undefined {
  const requestContext = (context as { requestContext?: { get?: (k: string) => unknown } })
    ?.requestContext;
  const value = requestContext?.get?.(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const createBookingTool = createTool({
  id: "create-booking",
  description:
    "Reserve a room, in two calls. Once check-availability confirmed the room is free and you have every detail, call this: the first call books nothing and returns needsConfirmation with a readBack to send the guest. After the guest confirms in their next message, call it again with exactly the same details to make the real reservation, which is held unpaid until the lodge verifies payment.",
  inputSchema: z.object({
    propertySlug: z.string().min(1).describe("Property slug from list-properties"),
    roomTier: z.string().min(1).describe("Room tier from list-rooms, e.g. executive"),
    checkIn: z.iso.date().describe("Arrival date, YYYY-MM-DD"),
    checkOut: z.iso.date().describe("Departure date, YYYY-MM-DD"),
    guests: z.number().int().positive().max(20),
    guestName: z.string().min(1).describe("The guest's full name, as they gave it"),
    guestEmail: z.string().min(1).describe("The guest's email address, for the confirmation"),
    activitySlugs: z
      .array(z.string().min(1))
      .default([])
      .describe("Experience slugs from list-activities, or an empty list"),
    paymentMethod: z
      .enum(paymentMethods)
      .describe("How the guest wants to pay: card, paypal or bank_transfer"),
    notes: z.string().max(2000).optional().describe("Anything the guest asked us to know"),
  }),
  execute: async (input, context) => {
    const property = await getPropertyBySlug(input.propertySlug.trim().toLowerCase());
    if (!property || !property.active) {
      return { ok: false as const, error: `No property called "${input.propertySlug}"` };
    }

    const room = await getRoomByTier(property.id, input.roomTier.trim().toLowerCase());
    if (!room || !room.active) {
      return { ok: false as const, error: `No room "${input.roomTier}" at ${property.name}` };
    }

    if (input.checkOut <= input.checkIn) {
      return { ok: false as const, error: "checkOut must be a later date than checkIn" };
    }
    if (input.guests > room.capacity) {
      return { ok: false as const, error: room.name + " sleeps " + room.capacity, code: "OVER_CAPACITY" };
    }

    // Slugs are what the model has; the database wants ids.
    let matchedActivities: { id: string; name: string; price: number }[] = [];
    if (input.activitySlugs.length > 0) {
      const activities = await getActivities(property.id);
      const wanted = new Set(input.activitySlugs.map((slug) => slug.trim().toLowerCase()));
      const matched = activities.filter((activity) => wanted.has(activity.slug));
      if (matched.length !== wanted.size) {
        const known = activities.map((activity) => activity.slug).join(", ");
        return {
          ok: false as const,
          error: `Unknown experience. Available at ${property.name}: ${known}`,
        };
      }
      matchedActivities = matched;
    }

    const guestPhone = readContext(context, GUEST_PHONE_KEY);
    const decision = confirmations.decide(
      guestPhone ?? "unknown-guest",
      bookingDetailsKey(input),
      readContext(context, TURN_KEY) ?? randomUUID(),
    );
    if (decision === "confirm") {
      const nights = Math.round(
        (Date.parse(input.checkOut + "T00:00:00Z") - Date.parse(input.checkIn + "T00:00:00Z")) /
          86_400_000,
      );
      // Priced the way createBooking prices it, so the read-back total is the booked total.
      const totalAmountUsd =
        room.pricePerNight * nights +
        matchedActivities.reduce((sum, activity) => sum + activity.price, 0);
      return {
        ok: false as const,
        needsConfirmation: true as const,
        readBack: {
          property: property.name,
          room: room.name,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          nights,
          guests: input.guests,
          activities: matchedActivities.map((activity) => activity.name),
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          paymentMethod: input.paymentMethod,
          totalAmountUsd,
        },
        howToReply:
          "Nothing is booked yet. Read these details and the total back to the guest and ask them to confirm. Only after they confirm in their next message, call create-booking again with exactly the same details.",
      };
    }

    try {
      const booking = await createBooking({
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        guestPhone,
        roomId: room.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        guests: input.guests,
        activityIds: matchedActivities.map((activity) => activity.id),
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        channel: readContext(context, CHANNEL_KEY) === "whatsapp" ? "whatsapp" : "web",
      });

      return {
        ok: true as const,
        reference: booking.reference,
        property: booking.propertyName,
        room: booking.roomName,
        checkIn: booking.checkIn.toISOString().slice(0, 10),
        checkOut: booking.checkOut.toISOString().slice(0, 10),
        nights: booking.nights,
        guests: booking.guests,
        activities: booking.activityNames,
        subtotalUsd: booking.subtotal,
        totalAmountUsd: booking.totalAmount,
        paymentMethod: booking.paymentMethod,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        // The agent once opened with "Your booking is confirmed!" and then said it was only held.
        howToReply:
          'Call request-payment now. Tell the guest their stay is held, not confirmed, until the lodge sees the payment. Never call it confirmed.',
      };
    } catch (error) {
      // Domain refusals are answers for the guest, not crashes.
      if (error instanceof BookingError) {
        return { ok: false as const, error: error.message, code: error.code };
      }
      throw error;
    }
  },
});

export const requestPaymentTool = createTool({
  id: "request-payment",
  description:
    "Issue the payment request for an existing booking and return the instructions to pass to the guest. Call this straight after create-booking, or when a guest asks how to pay. This moves no money: the lodge confirms the stay once it sees the payment.",
  inputSchema: z.object({
    reference: z.string().min(1).describe("The booking reference (it starts with FC-)"),
  }),
  execute: async ({ reference }) => {
    try {
      const request = await requestPayment(reference);
      return { ok: true as const, ...request };
    } catch (error) {
      if (error instanceof BookingError) {
        return { ok: false as const, error: error.message, code: error.code };
      }
      throw error;
    }
  },
});

/** Write tools, granted only to the WhatsApp booking agent. */
export const bookingTools = {
  createBooking: createBookingTool,
  requestPayment: requestPaymentTool,
};
