import { getBookingByReference } from "@forest-creek/db";
import { randomUUID } from "node:crypto";

import { RequestContext } from "@mastra/core/di";

import { paymentPageUrl } from "./links";

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

export function readContext(context: unknown, key: string): string | undefined {
  const requestContext = (context as { requestContext?: { get?: (k: string) => unknown } })
    ?.requestContext;
  const value = requestContext?.get?.(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The booking, if the guest messaging is the one who made it. Changing how a
 * booking is paid is the owner's call, recognised by the phone they message
 * from — the same rule look-up-booking uses before it says the guest's name.
 */
export async function ownBooking(reference: string, context: unknown) {
  const booking = await getBookingByReference(reference);
  if (!booking) return { error: "No booking matches that reference." } as const;
  const phone = readContext(context, GUEST_PHONE_KEY);
  if (!phone || booking.guestPhone !== phone) {
    return {
      error:
        "That booking was not made from this phone, so its payment method can't be changed here. The guest can choose any payment method on the payment page instead.",
      paymentPageUrl: paymentPageUrl(booking.reference),
    } as const;
  }
  return { booking } as const;
}
