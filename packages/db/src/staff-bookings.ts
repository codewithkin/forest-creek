import { z } from "zod";

import { attentionWhere } from "./alerts";
import { paymentPlan, lodgeToday } from "./booking-policy";
import { logBookingEvent, SYSTEM_ACTOR } from "./booking-events";
import {
  BookingError,
  bookingChannelSchema,
  insertBooking,
  lockRoom,
  maybeBookingWhere,
  occupyingBookingWhere,
  prepareBooking,
  securedBookingWhere,
  toStayDate,
  type Booking,
} from "./bookings";
import { prisma } from "./client";
import { paymentMethodSchema, paymentStatusSchema, bookingStatusSchema, refundStatusSchema } from "./domain";
import { isSecured } from "./hold-policy";
import { notifyBooking } from "./notifications";
import { manualPaymentMethods, recordManualPayment } from "./payments";
import { blockOverlapWhere } from "./room-blocks";

import type { Prisma } from "../prisma/generated/client";

/**
 * Everything staff do to a booking by hand: taking one over the phone or at the
 * door, correcting it, moving it, checking guests in and out. Guests' own
 * bookings go through createBooking; both write through the same prepareBooking
 * and claimRoomAndInsert, so a room can't be double-sold from either side.
 * Every change here is written to the booking's history.
 */

export const bookingSources = ["walk-in", "phone", "email", "agent", "other"] as const;

const paymentChoiceSchema = z.discriminatedUnion("kind", [
  /** Nothing yet: an unpaid "maybe", holding no room. */
  z.object({ kind: z.literal("none") }),
  /** Email the guest their booking and how to pay it. */
  z.object({ kind: z.literal("link") }),
  /** Staff vouch for the stay: confirmed, with the money to come on arrival. */
  z.object({ kind: z.literal("arrival") }),
  /** Money already in hand. */
  z.object({
    kind: z.literal("record"),
    amount: z.number().int().positive().max(1_000_000),
    method: z.enum(manualPaymentMethods),
    note: z.string().trim().min(1).max(300),
  }),
]);

export const createStaffBookingSchema = z
  .object({
    roomId: z.string().min(1),
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
    guests: z.number().int().positive().max(40),
    guestName: z.string().trim().min(1).max(120),
    /** A walk-in may not have one; they just get no emails. */
    guestEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).default(""),
    guestPhone: z.string().trim().max(40).optional(),
    activityIds: z.array(z.string().min(1)).default([]),
    notes: z.string().trim().max(2000).optional(),
    source: z.enum(bookingSources),
    /** A rate agreed with the guest, instead of the calendar's. */
    agreedRate: z.number().int().positive().max(100_000).optional(),
    rateNote: z.string().trim().max(300).optional(),
    paymentMethod: paymentMethodSchema.default("paynow"),
    payment: paymentChoiceSchema,
  })
  .refine((input) => input.agreedRate === undefined || Boolean(input.rateNote), {
    message: "Say why this rate was agreed",
    path: ["rateNote"],
  })
  .refine((input) => input.payment.kind !== "link" || input.guestEmail !== "", {
    message: "A payment link needs the guest's email",
    path: ["guestEmail"],
  });

export type CreateStaffBookingInput = z.input<typeof createStaffBookingSchema>;

async function loadOpen(id: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw new BookingError("No booking with id " + id, "BOOKING_NOT_FOUND");
  if (booking.bookingStatus === "cancelled" || booking.bookingStatus === "expired") {
    throw new BookingError(`${booking.reference} is ${booking.bookingStatus}`, "BOOKING_CANCELLED");
  }
  return booking;
}

/** A booking taken by staff. Past dates are allowed: a stay may be entered after it began. */
export async function createStaffBooking(input: CreateStaffBookingInput, by: string): Promise<Booking> {
  const data = createStaffBookingSchema.parse(input);
  const booking = await insertBooking(
    await prepareBooking(
      {
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        guestPhone: data.guestPhone || undefined,
        roomId: data.roomId,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        guests: data.guests,
        activityIds: data.activityIds,
        paymentMethod: data.paymentMethod,
        notes: data.notes,
        channel: "staff",
      },
      { agreedRate: data.agreedRate, rateNote: data.rateNote, allowPast: true, createdBy: by, source: data.source },
    ),
  );
  await logBookingEvent(
    booking.id,
    "created",
    by,
    `Entered by hand (${data.source})` + (data.agreedRate ? ` at an agreed $${data.agreedRate} a night: ${data.rateNote}` : ""),
  );

  switch (data.payment.kind) {
    case "none":
      return booking;
    case "link":
      await notifyBooking(booking.id, "created");
      return booking;
    case "arrival": {
      const confirmed = await prisma.booking.update({ where: { id: booking.id }, data: { bookingStatus: "confirmed", verifiedBy: by } });
      await logBookingEvent(booking.id, "status", by, "Confirmed without payment: pays on arrival");
      await notifyBooking(booking.id, "reserved");
      return confirmed;
    }
    case "record": {
      if (data.payment.amount > booking.totalAmount) {
        await logBookingEvent(booking.id, "payment", by, `Payment of $${data.payment.amount} not recorded: above the total`);
        throw new BookingError(
          `${booking.reference} was saved unpaid: $${data.payment.amount} is more than the $${booking.totalAmount} total.`,
          "OVERPAYMENT",
        );
      }
      return recordManualPayment(
        { id: booking.id, amount: data.payment.amount, method: data.payment.method, note: data.payment.note },
        by,
      );
    }
  }
}

export const updateBookingDetailsSchema = z.object({
  id: z.string().min(1),
  guestName: z.string().trim().min(1).max(120).optional(),
  guestEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).optional(),
  guestPhone: z.string().trim().max(40).optional(),
  guests: z.number().int().positive().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type UpdateBookingDetailsInput = z.infer<typeof updateBookingDetailsSchema>;

const DETAIL_LABELS = { guestName: "name", guestEmail: "email", guestPhone: "phone", guests: "guests", notes: "notes" } as const;

/** Corrects who the booking is for. Never touches dates, the room or money. */
export async function updateBookingDetails(input: UpdateBookingDetailsInput, by: string): Promise<Booking> {
  const { id, ...changes } = updateBookingDetailsSchema.parse(input);
  const booking = await loadOpen(id);
  if (changes.guests !== undefined && booking.roomId) {
    const room = await prisma.room.findUnique({ where: { id: booking.roomId }, select: { name: true, capacity: true } });
    if (room && changes.guests > room.capacity) {
      throw new BookingError(`${room.name} sleeps ${room.capacity}, but ${changes.guests} guests were requested`, "OVER_CAPACITY");
    }
  }
  const changed = (Object.keys(changes) as (keyof typeof DETAIL_LABELS)[]).filter(
    (key) => changes[key] !== undefined && changes[key] !== (booking[key] ?? ""),
  );
  if (changed.length === 0) return booking;
  const updated = await prisma.booking.update({
    where: { id },
    data: { ...changes, guestPhone: changes.guestPhone === "" ? null : changes.guestPhone },
  });
  // Names of the fields only: a guest's details do not belong in a history line.
  await logBookingEvent(id, "details", by, `Changed ${changed.map((key) => DETAIL_LABELS[key]).join(", ")}`);
  return updated;
}

export const moveBookingRoomSchema = z.object({ id: z.string().min(1), roomId: z.string().min(1) });

/**
 * Moves a stay to another room of the same property on the same dates, at the
 * price already agreed. Both rooms are locked, in id order, so two moves can't
 * deadlock and a booking can't land on the night being moved to.
 */
export async function moveBookingRoom(input: z.infer<typeof moveBookingRoomSchema>, by: string): Promise<Booking> {
  const { id, roomId } = moveBookingRoomSchema.parse(input);
  const booking = await loadOpen(id);
  if (booking.roomId === roomId) return booking;
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || !room.active) throw new BookingError("No bookable room with id " + roomId, "ROOM_NOT_FOUND");
  if (room.propertyId !== booking.propertyId) {
    throw new BookingError(`${room.name} is at another property`, "ROOM_NOT_FOUND");
  }
  if (booking.guests > room.capacity) {
    throw new BookingError(`${room.name} sleeps ${room.capacity}, but this booking is for ${booking.guests}`, "OVER_CAPACITY");
  }

  const moved = await prisma.$transaction(async (tx) => {
    for (const lockId of [booking.roomId, roomId].filter((value): value is string => Boolean(value)).sort()) {
      await lockRoom(tx, lockId);
    }
    const stay = await tx.booking.findFirst({
      where: {
        id: { not: id },
        roomId,
        ...occupyingBookingWhere(),
        checkIn: { lt: booking.checkOut },
        checkOut: { gt: booking.checkIn },
      },
      select: { reference: true },
    });
    if (stay) throw new BookingError(`${room.name} is taken by ${stay.reference} on those dates`, "ROOM_UNAVAILABLE");
    const block = await tx.roomBlock.findFirst({
      where: { roomId, ...blockOverlapWhere(booking.checkIn, booking.checkOut) },
      select: { id: true },
    });
    if (block) throw new BookingError(`${room.name} is closed on those dates`, "ROOM_UNAVAILABLE");
    return tx.booking.update({ where: { id }, data: { roomId, roomName: room.name } });
  });
  await logBookingEvent(id, "room", by, `Moved from ${booking.roomName} to ${room.name}`);
  return moved;
}

export const changeBookingExperiencesSchema = z.object({
  id: z.string().min(1),
  activityIds: z.array(z.string().min(1)).max(40),
});

/**
 * Adds or removes experiences. The total moves by what changed, so anything
 * else on the booking (extras from a quotation) is left alone. Refused if it
 * would take the total below what has been paid: that is a refund, not an edit.
 */
export async function changeBookingExperiences(
  input: z.infer<typeof changeBookingExperiencesSchema>,
  by: string,
): Promise<Booking> {
  const { id, activityIds } = changeBookingExperiencesSchema.parse(input);
  const booking = await loadOpen(id);
  const wanted = [...new Set(activityIds)];
  const all = await prisma.activity.findMany({ where: { id: { in: [...wanted, ...booking.activityIds] } } });
  const byId = new Map(all.map((activity) => [activity.id, activity]));
  if (wanted.some((activityId) => !byId.has(activityId) || byId.get(activityId)!.propertyId !== booking.propertyId)) {
    throw new BookingError("One or more activities do not exist", "UNKNOWN_ACTIVITY");
  }

  const added = wanted.filter((activityId) => !booking.activityIds.includes(activityId));
  const removed = booking.activityIds.filter((activityId) => !wanted.includes(activityId));
  if (added.length === 0 && removed.length === 0) return booking;
  const priceOf = (ids: string[]) => ids.reduce((sum, activityId) => sum + (byId.get(activityId)?.price ?? 0), 0);
  const totalAmount = booking.totalAmount + priceOf(added) - priceOf(removed);
  if (totalAmount < booking.amountPaid) {
    throw new BookingError(
      `That takes the total to $${totalAmount}, below the $${booking.amountPaid} already paid. Cancel or refund instead.`,
      "OVERPAYMENT",
    );
  }

  const removedNames = removed.map((activityId) => byId.get(activityId)?.name);
  const plan = paymentPlan(totalAmount, booking.checkIn.toISOString().slice(0, 10), lodgeToday());
  const updated = await prisma.booking.updateMany({
    // Guarded, so a payment landing meanwhile is not worked out against an old total.
    where: { id, amountPaid: booking.amountPaid, totalAmount: booking.totalAmount },
    data: {
      activityIds: wanted,
      activityNames: [
        ...booking.activityNames.filter((name) => !removedNames.includes(name)),
        ...added.map((activityId) => byId.get(activityId)!.name),
      ],
      totalAmount,
      ...(booking.amountPaid === 0
        ? {
            depositAmount: plan.depositAmount,
            balanceDueAt: plan.balanceDueDate ? toStayDate(plan.balanceDueDate) : null,
          }
        : {
            paymentStatus: booking.amountPaid >= totalAmount ? "verified" : "partial",
            balanceDueAt: booking.amountPaid >= totalAmount ? null : (booking.balanceDueAt ?? (plan.balanceDueDate ? toStayDate(plan.balanceDueDate) : null)),
          }),
    },
  });
  if (updated.count === 0) throw new BookingError(`${booking.reference} just changed. Try again.`, "ROOM_UNAVAILABLE");
  await logBookingEvent(id, "experiences", by, `Experiences changed: total now $${totalAmount}`);
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

/** Marks the guest as arrived. An unpaid booking must be paid or confirmed first. */
export async function checkInBooking(id: string, by: string): Promise<Booking> {
  const booking = await loadOpen(id);
  if (!isSecured(booking)) {
    throw new BookingError(`${booking.reference} isn't paid or confirmed yet. Record a payment first.`, "ROOM_UNAVAILABLE");
  }
  if (booking.checkIn > toStayDate(lodgeToday())) {
    throw new BookingError(`${booking.reference} arrives on ${booking.checkIn.toISOString().slice(0, 10)}`, "ROOM_UNAVAILABLE");
  }
  const { count } = await prisma.booking.updateMany({ where: { id, checkedInAt: null }, data: { checkedInAt: new Date() } });
  if (count === 1) await logBookingEvent(id, "check-in", by, "Checked in");
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

export async function checkOutBooking(id: string, by: string): Promise<Booking> {
  const booking = await loadOpen(id);
  if (!booking.checkedInAt) {
    throw new BookingError(`${booking.reference} hasn't checked in yet`, "ROOM_UNAVAILABLE");
  }
  const { count } = await prisma.booking.updateMany({ where: { id, checkedOutAt: null }, data: { checkedOutAt: new Date() } });
  if (count === 1) await logBookingEvent(id, "check-out", by, "Checked out");
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

/** For a click on the wrong row. */
export async function undoCheckIn(id: string, by: string): Promise<Booking> {
  const booking = await loadOpen(id);
  if (booking.checkedOutAt) throw new BookingError(`${booking.reference} has already checked out`, "ROOM_UNAVAILABLE");
  const { count } = await prisma.booking.updateMany({ where: { id, checkedInAt: { not: null } }, data: { checkedInAt: null } });
  if (count === 1) await logBookingEvent(id, "check-in", by, "Check-in undone");
  return prisma.booking.findUniqueOrThrow({ where: { id } });
}

/**
 * Finishes stays nobody checked out: the morning after departure the guest has
 * gone, whatever the dashboard says. Run by the sweeper; returns how many.
 */
export async function autoCheckOutPastStays(now: Date = new Date()): Promise<number> {
  const overdue = await prisma.booking.findMany({
    where: {
      checkedInAt: { not: null },
      checkedOutAt: null,
      bookingStatus: { notIn: ["cancelled", "expired"] },
      checkOut: { lt: toStayDate(lodgeToday(now)) },
    },
    select: { id: true },
  });
  let done = 0;
  for (const { id } of overdue) {
    const { count } = await prisma.booking.updateMany({ where: { id, checkedOutAt: null }, data: { checkedOutAt: now } });
    if (count === 1) {
      done++;
      await logBookingEvent(id, "check-out", SYSTEM_ACTOR, "Checked out automatically after the departure date");
    }
  }
  return done;
}

export const searchBookingsSchema = z.object({
  propertyIds: z.array(z.string().min(1)).optional(),
  /** Reference, guest name, email or phone. */
  search: z.string().trim().max(120).optional(),
  channel: bookingChannelSchema.optional(),
  bookingStatus: bookingStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  refundStatus: refundStatusSchema.optional(),
  maybe: z.boolean().optional(),
  needsAttention: z.boolean().optional(),
  /** Stays arriving on or after this date, YYYY-MM-DD. */
  from: z.iso.date().optional(),
  /** Stays arriving before this date, YYYY-MM-DD. */
  to: z.iso.date().optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().positive().max(5000).default(25),
});

export type SearchBookingsInput = z.input<typeof searchBookingsSchema>;

/** One page of bookings, newest first, with the count behind it. */
export async function searchBookings(input: SearchBookingsInput) {
  const { propertyIds, search, maybe, needsAttention, from, to, page, pageSize, ...filters } = searchBookingsSchema.parse(input);
  const where: Prisma.BookingWhereInput = {
    ...filters,
    propertyId: propertyIds ? { in: propertyIds } : undefined,
    ...(from || to ? { checkIn: { gte: from ? toStayDate(from) : undefined, lt: to ? toStayDate(to) : undefined } } : {}),
    AND: [
      ...(needsAttention ? [attentionWhere()] : []),
      ...(maybe === true ? [maybeBookingWhere()] : maybe === false ? [{ NOT: maybeBookingWhere() }] : []),
      ...(search
        ? [
            {
              OR: [
                { reference: { contains: search, mode: "insensitive" as const } },
                { guestName: { contains: search, mode: "insensitive" as const } },
                { guestEmail: { contains: search, mode: "insensitive" as const } },
                { guestPhone: { contains: search } },
                { groupRef: { contains: search, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * pageSize, take: pageSize }),
    prisma.booking.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

const TODAY_SELECT = {
  id: true,
  reference: true,
  guestName: true,
  guests: true,
  roomName: true,
  propertyName: true,
  checkIn: true,
  checkOut: true,
  checkedInAt: true,
  checkedOutAt: true,
  amountPaid: true,
  totalAmount: true,
  paymentStatus: true,
} as const;

/** Who is arriving, staying and leaving today, for the one-click check-in lists. */
export async function getTodayStays(today: string, propertyIds?: string[]) {
  const day = toStayDate(today);
  const scope = { ...(propertyIds ? { propertyId: { in: propertyIds } } : {}), ...securedBookingWhere() };
  const [arrivals, inHouse, departures] = await Promise.all([
    prisma.booking.findMany({
      where: { ...scope, checkIn: { lte: day }, checkOut: { gt: day }, checkedInAt: null },
      select: TODAY_SELECT,
      orderBy: { checkIn: "asc" },
    }),
    prisma.booking.findMany({
      where: { ...scope, checkedInAt: { not: null }, checkedOutAt: null, checkOut: { gt: day } },
      select: TODAY_SELECT,
      orderBy: { checkOut: "asc" },
    }),
    prisma.booking.findMany({
      where: { ...scope, checkedInAt: { not: null }, checkedOutAt: null, checkOut: { lte: day } },
      select: TODAY_SELECT,
      orderBy: { checkOut: "asc" },
    }),
  ]);
  return { arrivals, inHouse, departures };
}
