import { getBookingByReference } from "@forest-creek/db";
import { randomUUID } from "node:crypto";

import { RequestContext } from "@mastra/core/di";

import { paymentPageUrl } from "./links";

/**
 * The guest's own WhatsApp number, injected per request by the handler. It is
 * never a tool input, so the model cannot invent or substitute someone else's.
 * Absent on the website, where a visitor is anonymous.
 */
export const GUEST_PHONE_KEY = "guestPhone";
/**
 * The chat the guest is talking in ("whatsapp:…", or the website widget's
 * session). How a website guest — who has no phone to be known by — is
 * recognised as the owner of the bookings they made in that chat.
 */
export const CHAT_SESSION_KEY = "chatSessionId";
export const CHANNEL_KEY = "channel";
/** One id per agent run, which is one guest message. */
export const TURN_KEY = "turnId";

/**
 * Builds the per-request context a booking run needs. Exported so callers do
 * not have to depend on Mastra directly.
 */
export function buildGuestContext(guest: {
  phone?: string;
  chatSessionId?: string;
  channel: "web" | "whatsapp";
  turnId?: string;
}) {
  const entries: [string, string][] = [
    [CHANNEL_KEY, guest.channel],
    [TURN_KEY, guest.turnId ?? randomUUID()],
  ];
  if (guest.phone) entries.push([GUEST_PHONE_KEY, guest.phone]);
  if (guest.chatSessionId) entries.push([CHAT_SESSION_KEY, guest.chatSessionId]);
  return new RequestContext(entries);
}

export function readContext(context: unknown, key: string): string | undefined {
  const requestContext = (context as { requestContext?: { get?: (k: string) => unknown } })
    ?.requestContext;
  const value = requestContext?.get?.(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Who the guest is, as far as this run knows: their phone (WhatsApp), the chat they are in, or both. */
export function guestIdentity(context: unknown): { guestPhone?: string; chatSessionId?: string } {
  return { guestPhone: readContext(context, GUEST_PHONE_KEY), chatSessionId: readContext(context, CHAT_SESSION_KEY) };
}

/** One stable key per guest, for read-backs waiting on their confirmation. */
export function guestKey(context: unknown): string | undefined {
  const { guestPhone, chatSessionId } = guestIdentity(context);
  return guestPhone ?? chatSessionId;
}

/** Whether a booking is this guest's: made from their phone, or in this chat. */
export function isGuestsBooking(
  booking: { guestPhone: string | null; chatSessionId: string | null },
  context: unknown,
): boolean {
  const { guestPhone, chatSessionId } = guestIdentity(context);
  return (
    (Boolean(guestPhone) && booking.guestPhone === guestPhone) ||
    (Boolean(chatSessionId) && booking.chatSessionId === chatSessionId)
  );
}

/**
 * The booking, if the guest asking is the one who made it — from the phone
 * they message from, or in this chat. Changing how a booking is paid is the
 * owner's call; the same rule look-up-booking uses before it says their name.
 */
export async function ownBooking(reference: string, context: unknown) {
  const booking = await getBookingByReference(reference);
  if (!booking) return { error: "No booking matches that reference." } as const;
  if (!isGuestsBooking(booking, context)) {
    return {
      error:
        "That booking was not made by this guest (from this phone or in this chat), so its payment method can't be changed here. The guest can choose any payment method on the payment page instead.",
      paymentPageUrl: paymentPageUrl(booking.reference),
    } as const;
  }
  return { booking } as const;
}
