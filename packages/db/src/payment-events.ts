import { prisma } from "./client";

import type { PaymentEvent } from "../prisma/generated/client";

export type { PaymentEvent };

export type PaymentEventInput = {
  bookingId?: string | null;
  source: "callback" | "poll";
  reference?: string | null;
  status?: string | null;
  outcome: string;
  detail?: string | null;
  amount?: string | null;
  paynowReference?: string | null;
};

/**
 * Appends to the payment audit log. Never throws, like notifyBooking: failing
 * to write the log must not turn a payment Paynow confirmed into an error.
 */
export async function recordPaymentEvent(event: PaymentEventInput): Promise<void> {
  try {
    await prisma.paymentEvent.create({
      data: {
        ...event,
        // Bounded, since a rejected callback's fields are whatever the sender chose.
        reference: event.reference?.slice(0, 40) ?? null,
        status: event.status?.slice(0, 60) ?? null,
        detail: event.detail?.slice(0, 300) ?? null,
        amount: event.amount?.slice(0, 20) ?? null,
        paynowReference: event.paynowReference?.slice(0, 60) ?? null,
      },
    });
  } catch (error) {
    console.error("[payments] could not record a payment event", error);
  }
}

/**
 * A callback whose hash did not check out. Nothing in it is trusted, so it is
 * tied to no booking; the reference it claimed is kept only to help spot a
 * pattern, and the raw body is never stored.
 */
export function recordRejectedPaynowCallback(body: string, reason: string): Promise<void> {
  let claimed: string | null = null;
  try {
    claimed = new URLSearchParams(body.trim()).get("reference");
  } catch {
    // An unparseable body claims nothing.
  }
  return recordPaymentEvent({ source: "callback", reference: claimed, outcome: "rejected", detail: reason });
}

export function getBookingPaymentEvents(bookingId: string): Promise<PaymentEvent[]> {
  return prisma.paymentEvent.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
}
