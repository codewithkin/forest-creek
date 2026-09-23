import { randomBytes } from "node:crypto";
import { z } from "zod";

import { prisma } from "./client";
import { bookingStatusSchema, paymentMethodSchema, paymentStatusSchema } from "./domain";
import type { BookingStatus, PaymentStatus } from "./domain";
import { newHoldExpiry } from "./hold-policy";

import type { Booking } from "../prisma/generated/client";

export type { Booking };

const MS_PER_NIGHT = 86_400_000;

// No I/O/0/1 — references get read back over the phone.
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const REFERENCE_LENGTH = 6;
const REFERENCE_ATTEMPTS = 5;

export type BookingErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_UNAVAILABLE"
  | "OVER_CAPACITY"
  | "UNKNOWN_ACTIVITY"
  | "REFERENCE_EXHAUSTED"
  | "BOOKING_NOT_FOUND"
  | "BOOKING_CANCELLED"
  | "ALREADY_PAID";

export class BookingError extends Error {
  constructor(
    message: string,
    readonly code: BookingErrorCode,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export const bookingChannels = ["web", "whatsapp"] as const;
export const bookingChannelSchema = z.enum(bookingChannels);
export type BookingChannel = (typeof bookingChannels)[number];

export const createBookingSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.string().trim().toLowerCase().email(),
  guestPhone: z.string().trim().min(1).max(40).optional(),
  roomId: z.string().min(1),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  guests: z.number().int().positive().max(20),
  activityIds: z.array(z.string().min(1)).default([]),
  paymentMethod: paymentMethodSchema,
  notes: z.string().trim().max(2000).optional(),
  channel: bookingChannelSchema.default("web"),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const listBookingsSchema = z.object({
  channel: bookingChannelSchema.optional(),
  propertyId: z.string().min(1).optional(),
  propertyIds: z.array(z.string().min(1)).optional(),
  bookingStatus: bookingStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
  guestEmail: z.string().trim().toLowerCase().email().optional(),
  limit: z.number().int().positive().max(200).default(50),
});

export type ListBookingsInput = z.input<typeof listBookingsSchema>;

/** Treats a plain YYYY-MM-DD as a calendar day, not a moment in the caller's timezone. */
export function toStayDate(date: string): Date {
  return new Date(date + "T00:00:00.000Z");
}

export function countNights(checkIn: string, checkOut: string): number {
  const span = toStayDate(checkOut).getTime() - toStayDate(checkIn).getTime();
  return Math.round(span / MS_PER_NIGHT);
}

function generateReference(): string {
  let suffix = "";
  for (const byte of randomBytes(REFERENCE_LENGTH)) {
    suffix += REFERENCE_ALPHABET.charAt(byte % REFERENCE_ALPHABET.length);
  }
  return "FC-" + suffix;
}

export function getBookings(input: ListBookingsInput = {}): Promise<Booking[]> {
  const { channel, propertyId, propertyIds, bookingStatus, paymentStatus, guestEmail, limit } =
    listBookingsSchema.parse(input);
  return prisma.booking.findMany({
    where: {
      channel,
      propertyId: propertyIds ? { in: propertyIds } : propertyId,
      bookingStatus,
      paymentStatus,
      guestEmail,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export function getBookingById(id: string): Promise<Booking | null> {
  return prisma.booking.findUnique({ where: { id } });
}

export function getBookingByReference(reference: string): Promise<Booking | null> {
  return prisma.booking.findUnique({ where: { reference: reference.trim().toUpperCase() } });
}

/**
 * The bookings that actually occupy their room right now: not cancelled or
 * expired, and not an unpaid hold whose time ran out. Every availability read
 * goes through this one filter, so the site, the calendar and the concierge
 * agree without anything having to sweep lapsed holds first — the sweep
 * (sweepLapsedHolds) only makes the dashboard say so out loud.
 */
export function occupyingBookingWhere(now: Date = new Date()) {
  return {
    bookingStatus: { notIn: ["cancelled", "expired"] },
    OR: [
      { bookingStatus: "confirmed" },
      { paymentStatus: "verified" },
      { holdExpiresAt: null },
      { holdExpiresAt: { gt: now } },
    ],
  };
}

/**
 * A room is taken for any night an occupying booking already covers. Two stays
 * may share a boundary date, since one guest checks out the morning the next
 * checks in.
 */
export async function isRoomAvailable(
  roomId: string,
  checkIn: string,
  checkOut: string,
): Promise<boolean> {
  const clash = await prisma.booking.findFirst({
    where: {
      roomId,
      ...occupyingBookingWhere(),
      checkIn: { lt: toStayDate(checkOut) },
      checkOut: { gt: toStayDate(checkIn) },
    },
    select: { id: true },
  });
  return clash === null;
}

export async function getAvailableRooms(checkIn: string, checkOut: string, propertyId?: string) {
  const [rooms, clashes] = await Promise.all([
    prisma.room.findMany({
      where: { active: true, propertyId },
      orderBy: [{ sortOrder: "asc" }, { pricePerNight: "desc" }],
    }),
    prisma.booking.findMany({
      where: {
        ...occupyingBookingWhere(),
        checkIn: { lt: toStayDate(checkOut) },
        checkOut: { gt: toStayDate(checkIn) },
      },
      select: { roomId: true },
    }),
  ]);
  const taken = new Set(clashes.map((clash) => clash.roomId));
  return rooms.filter((room) => !taken.has(room.id));
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const data = createBookingSchema.parse(input);

  if (data.checkOut <= data.checkIn) {
    throw new BookingError("checkOut must be after checkIn", "ROOM_UNAVAILABLE");
  }
  const nights = countNights(data.checkIn, data.checkOut);

  const room = await prisma.room.findUnique({
    where: { id: data.roomId },
    include: { property: { select: { id: true, name: true } } },
  });
  if (!room || !room.active) {
    throw new BookingError("No bookable room with id " + data.roomId, "ROOM_NOT_FOUND");
  }
  if (data.guests > room.capacity) {
    throw new BookingError(
      room.name + " sleeps " + room.capacity + ", but " + data.guests + " guests were requested",
      "OVER_CAPACITY",
    );
  }

  const wanted = [...new Set(data.activityIds)];
  const activities = wanted.length
    ? await prisma.activity.findMany({
        where: { id: { in: wanted }, active: true },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  if (activities.length !== wanted.length) {
    throw new BookingError("One or more activities do not exist", "UNKNOWN_ACTIVITY");
  }

  // Accommodation is the subtotal; experiences are added on top of it.
  const subtotal = room.pricePerNight * nights;
  const totalAmount = subtotal + activities.reduce((sum, activity) => sum + activity.price, 0);

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Serialises bookings per room. Without it two guests can both read
        // "no clash" under READ COMMITTED and both insert — a live test had
        // two of six simultaneous requests win the same nights.
        await lockRoom(tx, room.id);
        const clash = await tx.booking.findFirst({
          where: {
            roomId: room.id,
            ...occupyingBookingWhere(),
            checkIn: { lt: toStayDate(data.checkOut) },
            checkOut: { gt: toStayDate(data.checkIn) },
          },
          select: { id: true },
        });
        if (clash) {
          throw new BookingError(
            room.name + " is already booked for those dates",
            "ROOM_UNAVAILABLE",
          );
        }

        return tx.booking.create({
          data: {
            reference: generateReference(),
            propertyId: room.property.id,
            propertyName: room.property.name,
            guestName: data.guestName,
            guestEmail: data.guestEmail,
            guestPhone: data.guestPhone,
            roomId: room.id,
            roomName: room.name,
            roomRate: room.pricePerNight,
            checkIn: toStayDate(data.checkIn),
            checkOut: toStayDate(data.checkOut),
            nights,
            guests: data.guests,
            activityIds: activities.map((activity) => activity.id),
            activityNames: activities.map((activity) => activity.name),
            subtotal,
            totalAmount,
            paymentMethod: data.paymentMethod,
            notes: data.notes,
            channel: data.channel,
            holdExpiresAt: newHoldExpiry(new Date()),
          },
        });
      });
    } catch (error) {
      if (isReferenceCollision(error) && attempt < REFERENCE_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new BookingError("Could not allocate a unique booking reference", "REFERENCE_EXHAUSTED");
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Takes the room's row lock for the rest of the transaction. Anything that
 * decides a room's nights are free and then claims them must hold this, or a
 * second writer can slip in between the check and the write.
 */
export async function lockRoom(tx: Tx, roomId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "room" WHERE id = ${roomId} FOR UPDATE`;
}

function isReferenceCollision(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function setBookingStatus(id: string, bookingStatus: BookingStatus): Promise<Booking> {
  return prisma.booking.update({ where: { id }, data: { bookingStatus } });
}

/**
 * Cancelling is how staff free a room nobody is using. Availability is derived
 * from non-cancelled bookings (see isRoomAvailable), so this is the whole of
 * it — the calendar, the room list and the concierge all read the same rows,
 * and nothing has to be corrected by hand in the database afterwards.
 *
 * The reason is appended to notes rather than overwriting them: what the guest
 * asked for is not something to throw away when a stay falls through.
 */
export async function cancelBooking(id: string, by: string, reason?: string): Promise<Booking> {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    throw new BookingError("No booking with id " + id, "BOOKING_NOT_FOUND");
  }
  if (booking.bookingStatus === "cancelled" || booking.bookingStatus === "expired") {
    throw new BookingError(booking.reference + " is already " + booking.bookingStatus, "BOOKING_CANCELLED");
  }

  const note = reason?.trim()
    ? `Cancelled by ${by}: ${reason.trim()}`
    : `Cancelled by ${by}`;

  return prisma.booking.update({
    where: { id },
    data: {
      bookingStatus: "cancelled",
      verifiedBy: by,
      notes: booking.notes ? booking.notes + "\n\n" + note : note,
    },
  });
}

export type RoomStay = {
  bookingId: string;
  reference: string;
  guestName: string;
  /** YYYY-MM-DD, the arrival day. */
  checkIn: string;
  /** YYYY-MM-DD, the departure day — the room is free again that morning. */
  checkOut: string;
  nights: number;
  bookingStatus: string;
  paymentStatus: string;
  channel: string;
};

export type RoomOccupancy = {
  roomId: string;
  roomName: string;
  active: boolean;
  stays: RoomStay[];
};

/** Stay dates are stored as UTC midnights, so they format in UTC or shift a day. */
function toStayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Which rooms are taken, and by whom, across a window — what the dashboard
 * calendar draws. Cancelled bookings are left out on purpose: a cancelled
 * stay is exactly the case where the room should read as free.
 */
export async function getRoomOccupancy(
  propertyId: string,
  range: { from: string; to: string },
): Promise<RoomOccupancy[]> {
  const [rooms, bookings] = await Promise.all([
    prisma.room.findMany({
      where: { propertyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, active: true },
    }),
    prisma.booking.findMany({
      where: {
        propertyId,
        ...occupyingBookingWhere(),
        checkIn: { lt: toStayDate(range.to) },
        checkOut: { gt: toStayDate(range.from) },
      },
      orderBy: { checkIn: "asc" },
    }),
  ]);

  return rooms.map((room) => ({
    roomId: room.id,
    roomName: room.name,
    active: room.active,
    stays: bookings
      .filter((booking) => booking.roomId === room.id)
      .map((booking) => ({
        bookingId: booking.id,
        reference: booking.reference,
        guestName: booking.guestName,
        checkIn: toStayKey(booking.checkIn),
        checkOut: toStayKey(booking.checkOut),
        nights: booking.nights,
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus,
        channel: booking.channel,
      })),
  }));
}

export function setPaymentStatus(
  id: string,
  paymentStatus: PaymentStatus,
  verifiedBy: string,
): Promise<Booking> {
  return prisma.booking.update({
    where: { id },
    data: {
      paymentStatus,
      verifiedBy,
      // Verifying the payment is what confirms the stay.
      bookingStatus: paymentStatus === "verified" ? "confirmed" : undefined,
    },
  });
}
