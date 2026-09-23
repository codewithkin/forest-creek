import { env } from "@forest-creek/env/server";
import { paymentReturnUrl } from "@forest-creek/payments";

import { prisma } from "./client";
import { describeError } from "./log";
import {
  renderBookingNotifications,
  type NotificationEvent,
} from "./notification-templates";

import type { Notification } from "../prisma/generated/client";

export * from "./notification-templates";
export type { Notification };

/** Where the web app publishes the Booking & Cancellation Policy. */
export const POLICY_PATH = "/policies";

export const notificationStatuses = ["pending", "sent", "failed", "skipped"] as const;
export type NotificationStatus = (typeof notificationStatuses)[number];

/** Attempts before a message is given up on and shown to staff as failed. */
export const MAX_NOTIFICATION_ATTEMPTS = 5;

/** Wait before retry n (after the nth failure): 1, 5, 15, then 60 minutes. */
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60];

/** How long a claimed message is left alone, so two workers never both send it. */
const CLAIM_MINUTES = 5;

const MINUTE = 60_000;

/**
 * Writes the messages an event produces for one booking. Never throws: an
 * email is a side effect of the booking changing, and must never be the
 * reason the change itself appears to fail. Duplicates are skipped by the
 * (booking, event, recipient) key, so every path that can report the same
 * payment may call this.
 */
export async function notifyBooking(
  bookingId: string,
  event: NotificationEvent,
  /**
   * For events that can happen more than once (a second date change): stored
   * as "event:key", so it is not taken for a duplicate of the first.
   */
  repeatKey?: string | number,
): Promise<number> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { property: { select: { email: true, phone: true } } },
    });
    if (!booking) return 0;

    const messages = renderBookingNotifications(event, booking, {
      staffEmail: booking.property.email,
      contactPhone: booking.property.phone,
      payUrl: paymentReturnUrl(booking.reference),
      policyUrl: new URL(POLICY_PATH, env.CORS_ORIGIN).toString(),
    });
    if (messages.length === 0) return 0;

    const { count } = await prisma.notification.createMany({
      data: messages.map((message) => ({
        ...message,
        bookingId,
        event: repeatKey === undefined ? event : `${event}:${repeatKey}`,
      })),
      skipDuplicates: true,
    });
    return count;
  } catch (error) {
    console.error(`[notifications] could not queue '${event}' for booking ${bookingId}: ${describeError(error)}`);
    return 0;
  }
}

export type OutgoingEmail = { to: string; subject: string; text: string };
export type SendEmail = (email: OutgoingEmail) => Promise<void>;

export type DeliveryResult = { sent: number; retrying: number; failed: number; skipped: number };

/**
 * Sends whatever is due. Takes the sender as an argument so this is tested
 * without a mail server; apps/server passes the real SMTP one.
 *
 * With mail unconfigured, due messages are marked skipped rather than left
 * pending: otherwise switching SMTP on months later would send every guest a
 * stale "payment pending" for a stay long past.
 */
export async function deliverDueNotifications(options: {
  send: SendEmail;
  configured: boolean;
  now?: Date;
  limit?: number;
  /** Only these bookings' messages — for tests and "send now" on one booking. */
  bookingIds?: string[];
}): Promise<DeliveryResult> {
  const now = options.now ?? new Date();
  const scope = options.bookingIds ? { bookingId: { in: options.bookingIds } } : {};
  const result: DeliveryResult = { sent: 0, retrying: 0, failed: 0, skipped: 0 };

  if (!options.configured) {
    const { count } = await prisma.notification.updateMany({
      where: { status: "pending", nextAttemptAt: { lte: now }, ...scope },
      data: { status: "skipped", lastError: "Email is not configured (SMTP_HOST is unset)." },
    });
    result.skipped = count;
    return result;
  }

  const due = await prisma.notification.findMany({
    where: { status: "pending", nextAttemptAt: { lte: now }, ...scope },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? 25,
  });

  for (const message of due) {
    // Claim it first: only the worker whose write lands sends it.
    const claimed = await prisma.notification.updateMany({
      where: { id: message.id, status: "pending", nextAttemptAt: message.nextAttemptAt },
      data: { nextAttemptAt: new Date(now.getTime() + CLAIM_MINUTES * MINUTE) },
    });
    if (claimed.count === 0) continue;

    const attempts = message.attempts + 1;
    try {
      await options.send({ to: message.recipient, subject: message.subject, text: message.body });
      await prisma.notification.update({
        where: { id: message.id },
        data: { status: "sent", sentAt: new Date(), attempts, lastError: null },
      });
      result.sent++;
    } catch (error) {
      const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      const giveUp = attempts >= MAX_NOTIFICATION_ATTEMPTS;
      const delay = RETRY_DELAYS_MINUTES[Math.min(attempts - 1, RETRY_DELAYS_MINUTES.length - 1)]!;
      await prisma.notification.update({
        where: { id: message.id },
        data: giveUp
          ? { status: "failed", attempts, lastError }
          : { attempts, lastError, nextAttemptAt: new Date(now.getTime() + delay * MINUTE) },
      });
      if (giveUp) result.failed++;
      else result.retrying++;
    }
  }

  return result;
}

export function getBookingNotifications(bookingId: string): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { bookingId },
    orderBy: { createdAt: "asc" },
  });
}

/** Puts a failed or skipped message back in the queue, from a staff click. */
export async function retryNotification(id: string): Promise<Notification> {
  return prisma.notification.update({
    where: { id },
    data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
}

export function getNotificationById(id: string): Promise<Notification | null> {
  return prisma.notification.findUnique({ where: { id } });
}
