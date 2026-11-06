import { z } from "zod";

import { logBookingEvent } from "./booking-events";
import { BookingError, claimRoomAndInsert, prepareBooking, type Booking, type PreparedBooking } from "./bookings";
import { prisma } from "./client";
import { allocatePayment, groupReference, spreadGroupPrice } from "./group-rules";
import { manualPaymentMethods, recordManualPayment } from "./payments";
import { bookingSources } from "./staff-bookings";

export * from "./group-rules";

/**
 * A group booking: several rooms for one guest (a wedding, a company, "all
 * rooms at Vumba"), entered once. Each room is its own Booking, so
 * availability, the calendar, check-in and reports work as for any stay; they
 * share a groupRef, one guest, one agreed price and one payment. No booking
 * emails go out: they describe one room, and a group's guest would get one per
 * room. Staff, who entered it, handle the group's correspondence.
 *
 * All the rooms are claimed in one transaction, in room-id order (the same
 * rule as accepting a quotation): if any room is taken, nothing is booked.
 */

const groupPaymentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("arrival") }),
  z.object({
    kind: z.literal("record"),
    amount: z.number().int().positive().max(10_000_000),
    method: z.enum(manualPaymentMethods),
    note: z.string().trim().min(1).max(300),
  }),
]);

export const groupBookingSchema = z
  .object({
    rooms: z
      .array(z.object({ roomId: z.string().min(1), guests: z.number().int().positive().max(40) }))
      .min(1, "Choose at least one room")
      .max(80),
    checkIn: z.iso.date(),
    checkOut: z.iso.date(),
    guestName: z.string().trim().min(1).max(120),
    guestEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).default(""),
    guestPhone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
    source: z.enum(bookingSources),
    /** A price agreed for the whole group, instead of the calendar's. */
    agreedTotal: z.number().int().positive().max(10_000_000).optional(),
    rateNote: z.string().trim().max(300).optional(),
    payment: groupPaymentSchema,
  })
  .refine((input) => new Set(input.rooms.map((room) => room.roomId)).size === input.rooms.length, {
    message: "A room is in the group twice",
    path: ["rooms"],
  })
  .refine((input) => input.agreedTotal === undefined || Boolean(input.rateNote), {
    message: "Say why this price was agreed",
    path: ["rateNote"],
  });

export type GroupBookingInput = z.input<typeof groupBookingSchema>;

const REFERENCE_RETRIES = 3;
const isUniqueClash = (error: unknown) => (error as { code?: unknown } | null)?.code === "P2002";

/** Prices every room for the group, with the agreed price spread across them when there is one. */
async function prepareGroup(data: z.output<typeof groupBookingSchema>, groupRef: string, by: string): Promise<PreparedBooking[]> {
  const draft = (roomId: string, guests: number) => ({
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    guestPhone: data.guestPhone || undefined,
    roomId,
    checkIn: data.checkIn,
    checkOut: data.checkOut,
    guests,
    activityIds: [],
    paymentMethod: "paynow" as const,
    notes: data.notes,
    channel: "staff" as const,
  });
  const options = { allowPast: true, createdBy: by, source: data.source, groupRef };
  const atCalendar = await Promise.all(data.rooms.map((room) => prepareBooking(draft(room.roomId, room.guests), options)));
  if (data.agreedTotal === undefined) return atCalendar;

  const spread = spreadGroupPrice(
    atCalendar.map((prepared) => ({ calendarSubtotal: prepared.data.subtotal as number, nights: prepared.data.nights as number })),
    data.agreedTotal,
  );
  return Promise.all(
    data.rooms.map((room, index) =>
      prepareBooking(draft(room.roomId, room.guests), {
        ...options,
        agreedRate: spread[index]!.rate,
        rateNote: data.rateNote,
        discount: spread[index]!.discount || undefined,
      }),
    ),
  );
}

export async function createGroupBooking(input: GroupBookingInput, by: string): Promise<{ groupRef: string; bookings: Booking[] }> {
  const data = groupBookingSchema.parse(input);

  for (let attempt = 0; ; attempt++) {
    const groupRef = groupReference();
    const prepared = await prepareGroup(data, groupRef, by);
    const totals = prepared.map((booking) => booking.data.totalAmount as number);
    let shares: number[] = [];
    if (data.payment.kind === "record") {
      try {
        shares = allocatePayment(totals, data.payment.amount);
      } catch (error) {
        throw new BookingError((error as Error).message, "OVERPAYMENT");
      }
    }

    let bookings: Booking[];
    try {
      // Room-id order: two groups wanting the same rooms can't deadlock each other.
      const ordered = [...prepared].sort((a, b) => a.room.id.localeCompare(b.room.id));
      const made = await prisma.$transaction(async (tx) => {
        const rows: Booking[] = [];
        for (const booking of ordered) rows.push(await claimRoomAndInsert(tx, booking));
        return rows;
      });
      // Back in the order staff chose them, so the payment fills that order.
      bookings = prepared.map((booking) => made.find((row) => row.roomId === booking.room.id)!);
    } catch (error) {
      if (isUniqueClash(error) && attempt < REFERENCE_RETRIES) continue;
      throw error;
    }

    const roomList = bookings.map((booking) => booking.roomName).join(", ");
    for (const booking of bookings) {
      await logBookingEvent(booking.id, "created", by, `Group ${groupRef} for ${data.guestName}: ${bookings.length} rooms (${roomList}), entered by hand (${data.source})`);
    }

    if (data.payment.kind === "arrival") {
      await prisma.booking.updateMany({ where: { groupRef }, data: { bookingStatus: "confirmed", verifiedBy: by } });
      for (const booking of bookings) await logBookingEvent(booking.id, "status", by, "Confirmed without payment: the group pays on arrival");
    }
    if (data.payment.kind === "record") {
      const payment = data.payment;
      for (const [index, booking] of bookings.entries()) {
        const share = shares[index]!;
        if (share === 0) continue;
        await recordManualPayment(
          { id: booking.id, amount: share, method: payment.method, note: `${payment.note} (group ${groupRef}: $${payment.amount} in all)` },
          by,
          { notify: false },
        );
      }
    }

    return { groupRef, bookings: await prisma.booking.findMany({ where: { groupRef }, orderBy: { roomName: "asc" } }) };
  }
}

/** The rooms of one group, for the booking drawer. */
export function getGroupBookings(groupRef: string) {
  return prisma.booking.findMany({
    where: { groupRef },
    orderBy: { roomName: "asc" },
    select: {
      id: true,
      reference: true,
      roomName: true,
      propertyId: true,
      propertyName: true,
      totalAmount: true,
      amountPaid: true,
      paymentStatus: true,
      bookingStatus: true,
      checkIn: true,
      checkOut: true,
    },
  });
}

/** The properties a set of rooms belong to, for the API's access check. */
export async function roomPropertyIds(roomIds: string[]): Promise<string[]> {
  const rooms = await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { propertyId: true } });
  if (rooms.length !== new Set(roomIds).size) throw new BookingError("One of those rooms no longer exists", "ROOM_NOT_FOUND");
  return [...new Set(rooms.map((room) => room.propertyId))];
}
