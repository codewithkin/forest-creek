import { env } from "@forest-creek/env/server";
import { isPaynowConfigured } from "@forest-creek/payments";

import { lodgeToday } from "./booking-policy";
import { prisma } from "./client";

/**
 * What staff need to act on, read off state the app already records - the
 * bookings, the email outbox and the payment event log. Nothing here pages
 * anyone; it is the dashboard's "Needs attention" panel, so a stuck payment
 * or a dead mail server is seen the same morning rather than when a guest
 * phones.
 */

/** A charge still "sent" after this long has almost certainly stalled. */
export const STUCK_PAYMENT_MINUTES = 60;

const MINUTE = 60_000;

export type AttentionKind = "stuck-payment" | "review" | "refund-due" | "failed-email" | "balance-overdue";

export type AttentionItem = {
  kind: AttentionKind;
  bookingId: string;
  reference: string;
  guestName: string;
  propertyName: string;
  detail: string;
  /** ISO time the problem started, as best the record shows. */
  since: string;
};

export type OperationalAlerts = {
  items: AttentionItem[];
  counts: Record<AttentionKind, number> & {
    /** Callbacks whose signature failed, last 24h — only visible to the owner. */
    rejectedCallbacks: number;
    /** Polls that could not reach Paynow, last hour. */
    paynowErrors: number;
  };
  config: { paynow: boolean; email: boolean };
};

/**
 * The bookings that need a human: flagged for review, a refund owed, a charge
 * stuck in flight, or an email that gave up. Shared by the attention panel
 * and the bookings list's "Needs attention" tab, so the two always agree.
 */
export function attentionWhere(now: Date = new Date()) {
  const stuckBefore = new Date(now.getTime() - STUCK_PAYMENT_MINUTES * MINUTE);
  return {
    OR: [
      { reviewNote: { not: null } },
      { refundStatus: "due" },
      // A charge in flight too long: a first charge ("processing") or a
      // balance charge on a confirmed stay (paynowChargeAmount set).
      {
        bookingStatus: { notIn: ["cancelled", "expired"] },
        paymentRequestedAt: { lt: stuckBefore },
        OR: [{ paymentStatus: "processing" }, { paynowChargeAmount: { not: null } }],
      },
      { notifications: { some: { status: "failed" } } },
      // The balance is past due on a confirmed stay (clause 1).
      { bookingStatus: "confirmed", paymentStatus: "partial", balanceDueAt: { lt: startOfLodgeDay(now) } },
    ],
  };
}

/** Today's date in Zimbabwe as the UTC midnight stay dates are stored at. */
function startOfLodgeDay(now: Date): Date {
  return new Date(lodgeToday(now) + "T00:00:00.000Z");
}

/**
 * `propertyIds` undefined means every property. Forged callbacks belong to no
 * property, so they are counted only for `includeUnattributed` - the owner,
 * even while they have one property selected.
 */
export async function getOperationalAlerts(
  propertyIds?: string[],
  options: { includeUnattributed?: boolean; now?: Date } = {},
): Promise<OperationalAlerts> {
  const now = options.now ?? new Date();
  const includeUnattributed = options.includeUnattributed ?? propertyIds === undefined;
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};

  const [bookings, rejectedCallbacks, paynowErrors] = await Promise.all([
    prisma.booking.findMany({
      where: { ...scope, ...attentionWhere(now) },
      include: {
        notifications: {
          where: { status: "failed" },
          select: { recipient: true, lastError: true, updatedAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    // Forged callbacks belong to no booking, so no property: the owner's alone.
    !includeUnattributed
      ? Promise.resolve(0)
      : prisma.paymentEvent.count({
          where: { outcome: "rejected", createdAt: { gte: new Date(now.getTime() - 24 * 60 * MINUTE) } },
        }),
    prisma.paymentEvent.count({
      where: {
        outcome: "error",
        createdAt: { gte: new Date(now.getTime() - 60 * MINUTE) },
        ...(propertyIds ? { booking: { propertyId: { in: propertyIds } } } : {}),
      },
    }),
  ]);

  const stuckBefore = now.getTime() - STUCK_PAYMENT_MINUTES * MINUTE;
  const items: AttentionItem[] = [];
  for (const booking of bookings) {
    const base = {
      bookingId: booking.id,
      reference: booking.reference,
      guestName: booking.guestName,
      propertyName: booking.propertyName,
    };
    if (booking.reviewNote) {
      items.push({ ...base, kind: "review", detail: booking.reviewNote, since: booking.updatedAt.toISOString() });
    }
    if (booking.refundStatus === "due") {
      items.push({
        ...base,
        kind: "refund-due",
        detail: `$${booking.totalAmount} was paid for a cancelled stay.`,
        since: booking.updatedAt.toISOString(),
      });
    }
    if (
      (booking.paymentStatus === "processing" || booking.paynowChargeAmount !== null) &&
      booking.bookingStatus !== "cancelled" &&
      booking.bookingStatus !== "expired" &&
      booking.paymentRequestedAt &&
      booking.paymentRequestedAt.getTime() < stuckBefore
    ) {
      items.push({
        ...base,
        kind: "stuck-payment",
        detail: `A charge was sent ${Math.round((now.getTime() - booking.paymentRequestedAt.getTime()) / MINUTE)} minutes ago and Paynow still reports "${booking.paynowStatus ?? "no status"}".`,
        since: booking.paymentRequestedAt.toISOString(),
      });
    }
    if (
      booking.bookingStatus === "confirmed" &&
      booking.paymentStatus === "partial" &&
      booking.balanceDueAt &&
      booking.balanceDueAt < startOfLodgeDay(now)
    ) {
      items.push({
        ...base,
        kind: "balance-overdue",
        detail: `$${booking.totalAmount - booking.amountPaid} balance was due on ${booking.balanceDueAt.toISOString().slice(0, 10)} and has not been paid.`,
        since: booking.balanceDueAt.toISOString(),
      });
    }
    for (const email of booking.notifications) {
      items.push({
        ...base,
        kind: "failed-email",
        detail: `An email to ${email.recipient} could not be sent${email.lastError ? `: ${email.lastError}` : "."}`,
        since: email.updatedAt.toISOString(),
      });
    }
  }

  const count = (kind: AttentionKind) => items.filter((item) => item.kind === kind).length;
  return {
    items: items.sort((a, b) => b.since.localeCompare(a.since)).slice(0, 50),
    counts: {
      "stuck-payment": count("stuck-payment"),
      review: count("review"),
      "refund-due": count("refund-due"),
      "failed-email": count("failed-email"),
      "balance-overdue": count("balance-overdue"),
      rejectedCallbacks,
      paynowErrors,
    },
    config: { paynow: isPaynowConfigured(), email: Boolean(env.SMTP_HOST) },
  };
}
