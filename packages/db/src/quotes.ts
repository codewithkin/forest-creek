import { env } from "@forest-creek/env/server";
import { z } from "zod";

import { addDays, lodgeToday } from "./booking-policy";
import { logBookingEvent, SYSTEM_ACTOR } from "./booking-events";
import {
  BookingError,
  claimRoomAndInsert,
  countNights,
  prepareBooking,
  toStayDate,
  type Booking,
  type PreparedBooking,
} from "./bookings";
import { prisma } from "./client";
import { describeError } from "./log";
import { notifyBooking, POLICY_PATH } from "./notifications";
import { renderQuoteNotifications, type QuoteEvent } from "./notification-templates";
import { isOpen, OPEN_STATUSES, quoteNumber, quoteStatuses, quoteTotals, spreadDiscount } from "./quote-rules";
import { quoteRoom } from "./rate-periods";

import type { Quote, QuoteLine } from "../prisma/generated/client";

export * from "./quote-rules";

/**
 * Quotations: a priced offer staff write and send, which a guest accepts
 * online. Prices are frozen on the lines. A quotation holds no room; accepting
 * makes bookings through the same room lock as every other booking, then the
 * guest pays them as usual, and only that secures the room.
 */

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "NOT_EDITABLE" | "NOT_OPEN" | "EXPIRED" | "ROOM_GONE" | "NO_ROUTE" | "INVALID",
  ) {
    super(message);
    this.name = "QuoteError";
  }
}

const lineSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("room"),
    roomId: z.string().min(1),
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
    guests: z.number().int().positive().max(40),
    /** Per night. Filled from the price calendar; staff may change it. */
    unitPrice: z.number().int().min(0).max(100_000),
  }),
  z.object({
    kind: z.literal("experience"),
    description: z.string().trim().min(1).max(160),
    unitPrice: z.number().int().min(0).max(100_000),
    quantity: z.number().int().positive().max(1000).default(1),
  }),
  z.object({
    kind: z.literal("custom"),
    description: z.string().trim().min(1).max(160),
    unitPrice: z.number().int().min(0).max(100_000),
    quantity: z.number().int().positive().max(1000).default(1),
  }),
]);

export const quoteInputSchema = z.object({
  propertyId: z.string().min(1),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).default(""),
  guestPhone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(120).optional(),
  validUntil: z.iso.date(),
  notes: z.string().trim().max(2000).optional(),
  discount: z.number().int().min(0).max(1_000_000).default(0),
  discountNote: z.string().trim().max(160).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one line").max(40),
});

export type QuoteInput = z.input<typeof quoteInputSchema>;
type QuoteData = z.output<typeof quoteInputSchema>;

/** Turns the form's lines into stored ones, checking each room belongs to the property. */
async function buildLines(data: QuoteData) {
  const roomIds = data.lines.flatMap((line) => (line.kind === "room" ? [line.roomId] : []));
  const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true, propertyId: true, capacity: true } });
  const byId = new Map(rooms.map((room) => [room.id, room]));

  return data.lines.map((line, sortOrder) => {
    if (line.kind !== "room") {
      return {
        kind: line.kind,
        description: line.description,
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        amount: line.unitPrice * line.quantity,
        sortOrder,
      };
    }
    const room = byId.get(line.roomId);
    if (!room || room.propertyId !== data.propertyId) throw new QuoteError("One of those rooms is not at this property", "INVALID");
    if (line.checkOut <= line.checkIn) throw new QuoteError(`${room.name}: the departure must be after the arrival`, "INVALID");
    if (line.guests > room.capacity) throw new QuoteError(`${room.name} sleeps ${room.capacity}`, "INVALID");
    const nights = countNights(line.checkIn, line.checkOut);
    return {
      kind: "room",
      roomId: room.id,
      description: room.name,
      checkIn: toStayDate(line.checkIn),
      checkOut: toStayDate(line.checkOut),
      guests: line.guests,
      unitPrice: line.unitPrice,
      quantity: nights,
      amount: line.unitPrice * nights,
      sortOrder,
    };
  });
}

function checkMoney(data: QuoteData, subtotal: number): void {
  if (data.discount > subtotal) throw new QuoteError("The discount is larger than the quotation", "INVALID");
  if (subtotal - data.discount <= 0) throw new QuoteError("A quotation needs something to charge", "INVALID");
}

export async function createQuote(input: QuoteInput, by: string): Promise<Quote> {
  const data = quoteInputSchema.parse(input);
  const lines = await buildLines(data);
  const { subtotal, total } = quoteTotals(lines, data.discount);
  checkMoney(data, subtotal);
  const { lines: _lines, validUntil, ...fields } = data;
  return prisma.quote.create({
    data: { ...fields, validUntil: toStayDate(validUntil), subtotal, total, createdBy: by, lines: { create: lines } },
  });
}

/** Only a draft changes. Once a guest has seen a quotation, staff duplicate it instead. */
export async function updateQuote(id: string, input: QuoteInput): Promise<Quote> {
  const data = quoteInputSchema.parse(input);
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) throw new QuoteError("No such quotation", "NOT_FOUND");
  if (existing.status !== "draft") throw new QuoteError("Only a draft can be edited. Duplicate it to change it.", "NOT_EDITABLE");
  const lines = await buildLines(data);
  const { subtotal, total } = quoteTotals(lines, data.discount);
  checkMoney(data, subtotal);
  const { lines: _lines, validUntil, ...fields } = data;
  return prisma.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { quoteId: id } });
    return tx.quote.update({
      where: { id },
      data: { ...fields, validUntil: toStayDate(validUntil), subtotal, total, lines: { create: lines } },
    });
  });
}

const DEFAULT_VALID_DAYS = 7;

/** A new draft with the same details and a fresh expiry date. */
export async function duplicateQuote(id: string, by: string): Promise<Quote> {
  const source = await prisma.quote.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!source) throw new QuoteError("No such quotation", "NOT_FOUND");
  return prisma.quote.create({
    data: {
      propertyId: source.propertyId,
      guestName: source.guestName,
      guestEmail: source.guestEmail,
      guestPhone: source.guestPhone,
      company: source.company,
      notes: source.notes,
      discount: source.discount,
      discountNote: source.discountNote,
      subtotal: source.subtotal,
      total: source.total,
      validUntil: toStayDate(addDays(lodgeToday(), DEFAULT_VALID_DAYS)),
      createdBy: by,
      lines: {
        create: source.lines.map(({ id: _id, quoteId: _quoteId, ...line }) => line),
      },
    },
  });
}

export async function cancelQuote(id: string): Promise<Quote> {
  const { count } = await prisma.quote.updateMany({
    where: { id, status: { in: ["draft", ...OPEN_STATUSES] } },
    data: { status: "cancelled" },
  });
  if (count === 0) throw new QuoteError("This quotation can no longer be cancelled", "NOT_OPEN");
  return prisma.quote.findUniqueOrThrow({ where: { id } });
}

export const listQuotesSchema = z.object({
  propertyIds: z.array(z.string().min(1)).optional(),
  status: z.enum(quoteStatuses).optional(),
  search: z.string().trim().max(120).optional(),
});

export async function listQuotes(input: z.input<typeof listQuotesSchema> = {}) {
  const { propertyIds, status, search } = listQuotesSchema.parse(input);
  const asNumber = search ? Number(search.replace(/\D/g, "")) : Number.NaN;
  const quotes = await prisma.quote.findMany({
    where: {
      propertyId: propertyIds ? { in: propertyIds } : undefined,
      status,
      ...(search
        ? {
            OR: [
              { guestName: { contains: search, mode: "insensitive" as const } },
              { company: { contains: search, mode: "insensitive" as const } },
              { guestEmail: { contains: search, mode: "insensitive" as const } },
              ...(Number.isSafeInteger(asNumber) && asNumber > 0 && asNumber < 2_147_483_647 ? [{ number: asNumber }] : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { property: { select: { name: true } } },
  });
  return quotes.map((quote) => ({ ...quote, label: quoteNumber(quote.number, quote.createdAt) }));
}

/** The open pipeline, for the screen's stat tiles. */
export async function getQuoteStats(propertyIds?: string[]) {
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};
  const [open, decided, accepted] = await Promise.all([
    prisma.quote.aggregate({ where: { ...scope, status: { in: [...OPEN_STATUSES] } }, _sum: { total: true }, _count: true }),
    prisma.quote.count({ where: { ...scope, status: { in: ["accepted", "declined", "expired"] } } }),
    prisma.quote.aggregate({ where: { ...scope, status: "accepted" }, _sum: { total: true }, _count: true }),
  ]);
  return {
    openCount: open._count,
    openValue: open._sum.total ?? 0,
    acceptedCount: accepted._count,
    acceptedValue: accepted._sum.total ?? 0,
    acceptanceRate: decided > 0 ? accepted._count / decided : null,
  };
}

function bookingLinks(bookings: Pick<Booking, "id" | "reference" | "roomName" | "totalAmount" | "depositAmount" | "amountPaid" | "paymentStatus">[]) {
  return bookings.map((booking) => ({
    id: booking.id,
    reference: booking.reference,
    roomName: booking.roomName,
    totalAmount: booking.totalAmount,
    depositAmount: booking.depositAmount ?? booking.totalAmount,
    amountPaid: booking.amountPaid,
    paymentStatus: booking.paymentStatus,
  }));
}

function viewOf(quote: Quote & { lines: QuoteLine[]; property: { name: string; location: string; phone: string; email: string } }) {
  return {
    id: quote.id,
    label: quoteNumber(quote.number, quote.createdAt),
    status: quote.status,
    guestName: quote.guestName,
    company: quote.company,
    validUntil: quote.validUntil.toISOString().slice(0, 10),
    notes: quote.notes,
    subtotal: quote.subtotal,
    discount: quote.discount,
    discountNote: quote.discountNote,
    total: quote.total,
    issuedAt: (quote.sentAt ?? quote.createdAt).toISOString().slice(0, 10),
    property: quote.property,
    lines: quote.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      description: line.description,
      checkIn: line.checkIn?.toISOString().slice(0, 10) ?? null,
      checkOut: line.checkOut?.toISOString().slice(0, 10) ?? null,
      guests: line.guests,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      amount: line.amount,
    })),
  };
}

const PROPERTY_FIELDS = { name: true, location: true, phone: true, email: true } as const;

/** Everything staff see about one quotation. */
export async function getQuote(id: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, property: { select: PROPERTY_FIELDS }, bookings: { orderBy: { createdAt: "asc" } } },
  });
  if (!quote) return null;
  return {
    ...viewOf(quote),
    propertyId: quote.propertyId,
    guestEmail: quote.guestEmail,
    guestPhone: quote.guestPhone,
    createdBy: quote.createdBy,
    sentAt: quote.sentAt?.toISOString() ?? null,
    viewedAt: quote.viewedAt?.toISOString() ?? null,
    acceptedAt: quote.acceptedAt?.toISOString() ?? null,
    declinedAt: quote.declinedAt?.toISOString() ?? null,
    declineReason: quote.declineReason,
    sendCount: quote.sendCount,
    problem: quote.problem,
    bookings: bookingLinks(quote.bookings),
    rawLines: quote.lines,
  };
}

/**
 * What the guest's link shows: the offer, and nothing about how staff handled
 * it. An out-of-date open quotation reads as expired before the sweeper gets there.
 */
export async function getPublicQuote(id: string) {
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, property: { select: PROPERTY_FIELDS }, bookings: { orderBy: { createdAt: "asc" } } },
  });
  // A draft has not been offered to anyone yet.
  if (!quote || quote.status === "draft") return null;
  const lapsed = isOpen(quote.status) && quote.validUntil < toStayDate(lodgeToday());
  return { ...viewOf(quote), status: lapsed ? "expired" : quote.status, bookings: bookingLinks(quote.bookings) };
}

export async function markQuoteViewed(id: string): Promise<void> {
  await prisma.quote.updateMany({ where: { id, status: "sent" }, data: { status: "viewed", viewedAt: new Date() } });
}

export function quoteLink(id: string): string {
  return new URL(`/quote/${id}`, env.CORS_ORIGIN).toString();
}

/** Never throws, like notifyBooking: an email must not make a change look failed. */
async function notifyQuote(id: string, event: QuoteEvent, repeatKey?: string | number): Promise<number> {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { property: { select: { name: true, email: true, phone: true } } },
    });
    if (!quote) return 0;
    const messages = renderQuoteNotifications(
      event,
      { ...quote, label: quoteNumber(quote.number, quote.createdAt), propertyName: quote.property.name },
      {
        staffEmail: quote.property.email,
        contactPhone: quote.property.phone,
        quoteUrl: quoteLink(id),
        policyUrl: new URL(POLICY_PATH, env.CORS_ORIGIN).toString(),
      },
    );
    const { count } = await prisma.notification.createMany({
      data: messages
        .filter((message) => message.recipient)
        .map(({ document, ...message }) => ({
          ...message,
          content: document,
          quoteId: id,
          event: repeatKey === undefined ? `quote-${event}` : `quote-${event}:${repeatKey}`,
        })),
      skipDuplicates: true,
    });
    return count;
  } catch (error) {
    console.error(`[notifications] could not queue '${event}' for quote ${id}: ${describeError(error)}`);
    return 0;
  }
}

/** What a send needs to know, refusing a quotation that can't go out. */
export async function prepareQuoteSend(id: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) throw new QuoteError("No such quotation", "NOT_FOUND");
  if (quote.status !== "draft" && !isOpen(quote.status)) {
    throw new QuoteError(`This quotation is ${quote.status}. Duplicate it to send it again.`, "NOT_OPEN");
  }
  if (quote.validUntil < toStayDate(lodgeToday())) {
    throw new QuoteError("The valid-until date has passed. Duplicate it with a new date.", "EXPIRED");
  }
  return {
    id: quote.id,
    label: quoteNumber(quote.number, quote.createdAt),
    guestName: quote.guestName,
    guestEmail: quote.guestEmail,
    guestPhone: quote.guestPhone,
    total: quote.total,
    link: quoteLink(quote.id),
    sendCount: quote.sendCount,
  };
}

/** Queues the guest's email: a repeat send is a new message, not a duplicate. */
export function queueQuoteEmail(id: string, sendNumber: number): Promise<number> {
  return notifyQuote(id, "sent", sendNumber);
}

/** Records that it reached the guest through at least one route. */
export async function markQuoteSent(id: string, problem: string | null): Promise<Quote> {
  const quote = await prisma.quote.update({
    where: { id },
    data: { sendCount: { increment: 1 }, sentAt: new Date(), problem },
  });
  if (quote.status === "draft") return prisma.quote.update({ where: { id }, data: { status: "sent" } });
  return quote;
}

/**
 * Offers a draft without sending anything: for a quotation staff download and
 * hand over themselves. Its guest link and PDF work from then on. Open ones
 * are left as they are; the same checks as a send apply.
 */
export async function issueQuote(id: string): Promise<{ label: string; link: string }> {
  const quote = await prepareQuoteSend(id);
  await prisma.quote.updateMany({ where: { id, status: "draft" }, data: { status: "sent", sentAt: new Date() } });
  return { label: quote.label, link: quote.link };
}

export async function recordQuoteProblem(id: string, problem: string): Promise<void> {
  await prisma.quote.update({ where: { id }, data: { problem } }).catch(() => undefined);
}

const REFERENCE_RETRIES = 3;

const isReferenceClash = (error: unknown) => (error as { code?: unknown } | null)?.code === "P2002";

/**
 * The guest says yes. In one transaction: the status moves (so a double click
 * books once), then every room is claimed in id order (so two acceptances can't
 * deadlock), and if any room has gone, nothing is written at all. The quotation
 * stays open, staff are told, and the guest is asked to get in touch.
 */
export async function acceptQuote(id: string): Promise<{ bookings: Booking[]; alreadyAccepted: boolean }> {
  const quote = await prisma.quote.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!quote || quote.status === "draft") throw new QuoteError("No such quotation", "NOT_FOUND");
  if (quote.status === "accepted") {
    return { bookings: await prisma.booking.findMany({ where: { quoteId: id } }), alreadyAccepted: true };
  }
  if (!isOpen(quote.status)) throw new QuoteError(`This quotation is ${quote.status}.`, "NOT_OPEN");
  if (quote.validUntil < toStayDate(lodgeToday())) throw new QuoteError("This quotation has expired.", "EXPIRED");

  const roomLines = quote.lines.filter((line) => line.kind === "room" && line.roomId && line.checkIn && line.checkOut);
  const extras = quote.lines.filter((line) => line.kind !== "room").map((line) => ({
    name: line.quantity > 1 ? `${line.description} × ${line.quantity}` : line.description,
    amount: line.amount,
  }));
  const extrasTotal = extras.reduce((sum, extra) => sum + extra.amount, 0);
  // Everything that isn't a room goes on the first booking.
  const discounts = spreadDiscount(roomLines.map((line, index) => line.amount + (index === 0 ? extrasTotal : 0)), quote.discount);

  try {
    const prepared: PreparedBooking[] = [];
    for (const [index, line] of roomLines.entries()) {
      prepared.push(
        await prepareBooking(
          {
            guestName: quote.guestName,
            guestEmail: quote.guestEmail,
            guestPhone: quote.guestPhone ?? undefined,
            roomId: line.roomId!,
            checkIn: line.checkIn!.toISOString().slice(0, 10),
            checkOut: line.checkOut!.toISOString().slice(0, 10),
            guests: line.guests ?? 1,
            activityIds: [],
            paymentMethod: "paynow",
            channel: "quote",
            policyAccepted: true,
          },
          {
            agreedRate: line.unitPrice,
            rateNote: `Quotation ${quoteNumber(quote.number, quote.createdAt)}`,
            extras: index === 0 ? extras : [],
            discount: discounts[index],
            quoteId: id,
            source: "quotation",
          },
        ),
      );
    }
    const ordered = [...prepared].sort((a, b) => a.room.id.localeCompare(b.room.id));

    for (let attempt = 0; ; attempt++) {
      try {
        const bookings = await prisma.$transaction(async (tx) => {
          const { count } = await tx.quote.updateMany({
            where: { id, status: { in: [...OPEN_STATUSES] } },
            data: { status: "accepted", acceptedAt: new Date(), problem: null },
          });
          if (count === 0) return null;
          const made: Booking[] = [];
          for (const booking of ordered) made.push(await claimRoomAndInsert(tx, booking));
          return made;
        });
        if (bookings === null) {
          return { bookings: await prisma.booking.findMany({ where: { quoteId: id } }), alreadyAccepted: true };
        }
        for (const booking of bookings) {
          await logBookingEvent(booking.id, "created", SYSTEM_ACTOR, `Accepted online from ${quoteNumber(quote.number, quote.createdAt)}`);
          await notifyBooking(booking.id, "created");
        }
        await notifyQuote(id, "accepted");
        return { bookings, alreadyAccepted: false };
      } catch (error) {
        if (isReferenceClash(error) && attempt < REFERENCE_RETRIES) continue;
        throw error;
      }
    }
  } catch (error) {
    if (!(error instanceof BookingError)) throw error;
    await recordQuoteProblem(id, `The guest tried to accept, but: ${error.message}`);
    await notifyQuote(id, "accept-failed", Date.now());
    throw new QuoteError(
      "Sorry, one of these dates has just been taken, so nothing has been booked. The team has been told and will contact you.",
      "ROOM_GONE",
    );
  }
}

export const declineQuoteSchema = z.object({ id: z.string().min(1), reason: z.string().trim().max(500).optional() });

export async function declineQuote(input: z.infer<typeof declineQuoteSchema>): Promise<void> {
  const { id, reason } = declineQuoteSchema.parse(input);
  const { count } = await prisma.quote.updateMany({
    where: { id, status: { in: [...OPEN_STATUSES] } },
    data: { status: "declined", declinedAt: new Date(), declineReason: reason || null },
  });
  if (count === 0) throw new QuoteError("This quotation can no longer be declined", "NOT_OPEN");
  await notifyQuote(id, "declined");
}

/** Sweeper: open quotations past their date close, silently. */
export async function expireQuotes(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.quote.updateMany({
    where: { status: { in: [...OPEN_STATUSES] }, validUntil: { lt: toStayDate(lodgeToday(now)) } },
    data: { status: "expired" },
  });
  return count;
}

const REMINDER_DAYS_BEFORE = 2;

/** Sweeper: one nudge, two days before a quotation lapses. */
export async function remindQuotes(now: Date = new Date()): Promise<number> {
  const due = await prisma.quote.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      reminderSentAt: null,
      guestEmail: { not: "" },
      validUntil: { lte: toStayDate(addDays(lodgeToday(now), REMINDER_DAYS_BEFORE)), gte: toStayDate(lodgeToday(now)) },
    },
    select: { id: true },
  });
  let sent = 0;
  for (const { id } of due) {
    const { count } = await prisma.quote.updateMany({ where: { id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (count === 1) {
      await notifyQuote(id, "reminder");
      sent++;
    }
  }
  return sent;
}

/** The price a room line starts at: what the calendar says for those dates. */
export async function priceRoomForQuote(roomId: string, checkIn: string, checkOut: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, pricePerNight: true } });
  if (!room) throw new QuoteError("No such room", "NOT_FOUND");
  const stay = await quoteRoom(room, checkIn, checkOut);
  return { unitPrice: stay.averageRate, nights: stay.nightlyRates.length };
}

/** Open quotations with something a person should look at. */
export async function getQuoteProblems(propertyIds?: string[]) {
  const quotes = await prisma.quote.findMany({
    where: {
      propertyId: propertyIds ? { in: propertyIds } : undefined,
      OR: [
        { problem: { not: null }, status: { in: ["draft", ...OPEN_STATUSES] } },
        { notifications: { some: { status: "failed", audience: "guest" } }, status: { in: [...OPEN_STATUSES] } },
      ],
    },
    select: { id: true, number: true, createdAt: true, guestName: true, problem: true },
    take: 20,
  });
  return quotes.map((quote) => ({
    id: quote.id,
    label: quoteNumber(quote.number, quote.createdAt),
    guestName: quote.guestName,
    detail: quote.problem ?? "The email to the guest could not be sent.",
  }));
}
