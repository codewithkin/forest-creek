import { logBookingEvent } from "./booking-events";
import { BookingError } from "./bookings";
import { prisma } from "./client";

/**
 * The owner's single deletes, for a booking or a receipt entered by mistake
 * (the whole-database erase is erase-data.ts). Owner only: packages/api
 * guards both with adminProcedure.
 */

/**
 * Removes one booking and everything that is only about it: its receipts,
 * history, emails and payment log. Documents made from it (invoices,
 * registration cards, files) are kept and lose their link to it.
 */
export async function deleteBookingRecord(id: string): Promise<{ reference: string }> {
  const booking = await prisma.booking.findUnique({ where: { id }, select: { id: true, reference: true } });
  if (!booking) throw new BookingError("No such booking", "BOOKING_NOT_FOUND");
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { bookingId: id } }),
    prisma.paymentEvent.deleteMany({ where: { bookingId: id } }),
    prisma.bookingEvent.deleteMany({ where: { bookingId: id } }),
    prisma.receipt.deleteMany({ where: { bookingId: id } }),
    prisma.booking.delete({ where: { id } }),
  ]);
  return { reference: booking.reference };
}

/**
 * Removes one receipt and takes its amount back off the booking, so what the
 * booking says was paid still matches its receipts. A booking left with
 * nothing paid goes back to unpaid (a "maybe" that holds no room), unless
 * the guest has already checked in.
 */
export async function deleteReceiptRecord(id: string, by: string): Promise<{ bookingId: string; amount: number }> {
  const receipt = await prisma.receipt.findUnique({ where: { id }, include: { booking: true } });
  if (!receipt) throw new BookingError("No such receipt", "BOOKING_NOT_FOUND");
  const { booking } = receipt;
  const paid = Math.max(0, booking.amountPaid - receipt.amount);
  const nothingPaid = paid === 0;
  await prisma.$transaction([
    prisma.receipt.delete({ where: { id } }),
    prisma.booking.update({
      where: { id: booking.id },
      data: {
        amountPaid: paid,
        paymentStatus: nothingPaid ? "pending" : paid >= booking.totalAmount ? "verified" : "partial",
        ...(nothingPaid && booking.bookingStatus === "confirmed" && !booking.checkedInAt ? { bookingStatus: "pending" } : {}),
      },
    }),
  ]);
  await logBookingEvent(booking.id, "payment", by, `A receipt for $${receipt.amount} was deleted; paid is now $${paid}`);
  return { bookingId: booking.id, amount: receipt.amount };
}
