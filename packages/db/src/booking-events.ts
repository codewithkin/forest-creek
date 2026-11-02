import { prisma } from "./client";
import { describeError } from "./log";

/** Who did it, when no member of staff did: Paynow, the sweeper, the website, the agent. */
export const SYSTEM_ACTOR = "system";

export type BookingEventKind =
  | "created"
  | "payment"
  | "status"
  | "dates"
  | "room"
  | "details"
  | "experiences"
  | "check-in"
  | "check-out"
  | "cancelled"
  | "refund";

/**
 * Adds a line to a booking's history. Never throws: the record of a change
 * must not be able to make the change itself look failed.
 */
export async function logBookingEvent(
  bookingId: string,
  kind: BookingEventKind,
  actor: string,
  detail: string,
): Promise<void> {
  try {
    await prisma.bookingEvent.create({ data: { bookingId, kind, actor, detail } });
  } catch (error) {
    console.error(`[bookings] could not log '${kind}' for booking ${bookingId}: ${describeError(error)}`);
  }
}

export function getBookingEvents(bookingId: string) {
  return prisma.bookingEvent.findMany({ where: { bookingId }, orderBy: { createdAt: "desc" } });
}
