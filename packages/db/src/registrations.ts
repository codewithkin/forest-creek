import { z } from "zod";

import { toStayDate } from "./bookings";
import { prisma } from "./client";
import { formatReceiptNumber } from "./receipts";

import type { GuestRegistration, Prisma } from "../prisma/generated/client";

/**
 * The guest registration card, from the front desk's paper book: who is
 * staying, their documents and contacts, the stay, how they pay, and their
 * signature under the lodge's conditions. Identity numbers live here, so
 * nothing in this file logs, and there is no public link to a card.
 */

export class RegistrationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "BAD_REQUEST",
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

/** The paper card's conditions, in plain order. The guest signs under exactly this text, which is kept with the card. */
export const REGISTRATION_CONDITIONS =
  "It is an express condition of my/our occupation of, or visit to, these premises that Forest Creek Accommodations is not responsible for loss of or damage to my property which is, or may be, brought onto these premises, arising from fire, theft, negligence or otherwise, by whomsoever caused, or from a wrongful act of any person in the employment of the proprietor of Forest Creek Accommodations.";

export const registrationPaymentMethods = ["cash", "bank transfer", "ecocash", "card", "other"] as const;

/** REG-0201: the card's running number. */
export function registrationNumber(number: number): string {
  return `REG-${String(number).padStart(4, "0")}`;
}

export const MAX_SIGNATURE_LENGTH = 400_000;
const text = (max: number) => z.string().trim().max(max).optional();

export const registrationInputSchema = z.object({
  propertyId: z.string().min(1),
  bookingId: z.string().min(1).optional(),
  guestName: z.string().trim().min(1).max(160),
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50).default(0),
  childrenAges: text(80),
  nationality: text(80),
  idNumber: text(60),
  passportNumber: text(60),
  address: text(300),
  city: text(80),
  country: text(80),
  phone: text(40),
  phoneWork: text(40),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).optional(),
  carRegistration: text(30),
  roomName: z.string().trim().min(1).max(120),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  receiptNumber: text(60),
  paymentMethod: z.enum(registrationPaymentMethods).optional(),
  /** The guest's signature, drawn on the screen: a PNG data URL. */
  signature: z
    .string()
    .max(MAX_SIGNATURE_LENGTH, "The signature is too large")
    .refine((value) => value.startsWith("data:image/png;base64,"), "The signature must be a drawn image")
    .optional(),
  receptionist: text(120),
});

export type RegistrationInput = z.input<typeof registrationInputSchema>;

const DAY = 86_400_000;

export async function createRegistration(input: RegistrationInput, by: { email: string; name?: string | null }): Promise<GuestRegistration> {
  const data = registrationInputSchema.parse(input);
  const checkIn = toStayDate(data.checkIn);
  const checkOut = toStayDate(data.checkOut);
  if (checkOut <= checkIn) throw new RegistrationError("The check-out must be after the check-in", "BAD_REQUEST");
  if (data.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId }, select: { propertyId: true } });
    if (!booking || booking.propertyId !== data.propertyId) throw new RegistrationError("That booking belongs to another property", "BAD_REQUEST");
  }
  const blank = (value: string | undefined) => value || null;
  return prisma.guestRegistration.create({
    data: {
      propertyId: data.propertyId,
      bookingId: data.bookingId,
      guestName: data.guestName,
      adults: data.adults,
      children: data.children,
      childrenAges: data.children > 0 ? blank(data.childrenAges) : null,
      nationality: blank(data.nationality),
      idNumber: blank(data.idNumber),
      passportNumber: blank(data.passportNumber),
      address: blank(data.address),
      city: blank(data.city),
      country: blank(data.country),
      phone: blank(data.phone),
      phoneWork: blank(data.phoneWork),
      email: blank(data.email),
      carRegistration: blank(data.carRegistration),
      roomName: data.roomName,
      checkIn,
      checkOut,
      nights: Math.round((checkOut.getTime() - checkIn.getTime()) / DAY),
      receiptNumber: blank(data.receiptNumber),
      paymentMethod: data.paymentMethod ?? null,
      conditions: REGISTRATION_CONDITIONS,
      signature: data.signature ?? null,
      signedAt: data.signature ? new Date() : null,
      receptionist: data.receptionist || by.name || by.email,
      createdBy: by.email,
    },
  });
}

const PROPERTY_FIELDS = { name: true, location: true, phone: true, email: true } as const;

/** One card, all of it, for staff. */
export async function getRegistration(id: string) {
  const card = await prisma.guestRegistration.findUnique({ where: { id }, include: { property: { select: PROPERTY_FIELDS } } });
  if (!card) return null;
  return {
    ...card,
    label: registrationNumber(card.number),
    checkIn: card.checkIn.toISOString().slice(0, 10),
    checkOut: card.checkOut.toISOString().slice(0, 10),
    signedAt: card.signedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
  };
}

export type RegistrationView = NonNullable<Awaited<ReturnType<typeof getRegistration>>>;

export const listRegistrationsSchema = z.object({
  search: z.string().trim().max(120).optional(),
  /** Arriving from this day (YYYY-MM-DD). */
  from: z.iso.date().optional(),
});

/** The list leaves identity numbers out: they are only on the card itself. */
export async function listRegistrations(input: z.input<typeof listRegistrationsSchema>, propertyIds?: string[]) {
  const { search, from } = listRegistrationsSchema.parse(input);
  const number = search?.match(/(\d{1,6})\s*$/)?.[1];
  const where: Prisma.GuestRegistrationWhereInput = {
    ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
    ...(from ? { checkIn: { gte: toStayDate(from) } } : {}),
    ...(search
      ? {
          OR: [
            { guestName: { contains: search, mode: "insensitive" } },
            { roomName: { contains: search, mode: "insensitive" } },
            { carRegistration: { contains: search, mode: "insensitive" } },
            ...(number ? [{ number: Number(number) }] : []),
          ],
        }
      : {}),
  };
  const cards = await prisma.guestRegistration.findMany({
    where,
    orderBy: { number: "desc" },
    take: 500,
    select: {
      id: true,
      number: true,
      guestName: true,
      adults: true,
      children: true,
      roomName: true,
      checkIn: true,
      checkOut: true,
      nights: true,
      signedAt: true,
      bookingId: true,
      property: { select: { name: true } },
    },
  });
  return cards.map((card) => ({
    id: card.id,
    label: registrationNumber(card.number),
    guestName: card.guestName,
    party: card.adults + card.children,
    roomName: card.roomName,
    checkIn: card.checkIn.toISOString().slice(0, 10),
    checkOut: card.checkOut.toISOString().slice(0, 10),
    nights: card.nights,
    signed: Boolean(card.signedAt),
    bookingId: card.bookingId,
    propertyName: card.property.name,
  }));
}

/** The cards made for a booking, for its drawer. */
export function registrationsForBooking(bookingId: string) {
  return prisma.guestRegistration.findMany({
    where: { bookingId },
    orderBy: { number: "asc" },
    select: { id: true, number: true, guestName: true, signedAt: true },
  });
}

/** The property each card belongs to, for the API's access check. */
export async function registrationProperties(ids: string[]): Promise<string[]> {
  const rows = await prisma.guestRegistration.findMany({ where: { id: { in: ids } }, select: { propertyId: true } });
  if (rows.length !== new Set(ids).size) throw new RegistrationError("Some of those cards no longer exist", "NOT_FOUND");
  return [...new Set(rows.map((row) => row.propertyId))];
}

/** For a card filled in by mistake. */
export async function deleteRegistrations(ids: string[]): Promise<{ deleted: number }> {
  const { count } = await prisma.guestRegistration.deleteMany({ where: { id: { in: ids } } });
  return { deleted: count };
}

/** A card's starting point from a booking: the guest, the party, the room and the stay. */
export async function registrationDraftFromBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new RegistrationError("No such booking", "NOT_FOUND");
  const method = booking.paymentMethod === "ecocash" ? "ecocash" : booking.paymentMethod === "visa" ? "card" : undefined;
  const receipt = await prisma.receipt.findFirst({ where: { bookingId }, orderBy: { issuedAt: "desc" }, select: { number: true, issuedAt: true } });
  return {
    propertyId: booking.propertyId,
    bookingId: booking.id,
    guestName: booking.guestName,
    adults: booking.guests,
    email: booking.guestEmail,
    phone: booking.guestPhone ?? undefined,
    roomName: booking.roomName,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    checkOut: booking.checkOut.toISOString().slice(0, 10),
    receiptNumber: receipt ? formatReceiptNumber(receipt.number, receipt.issuedAt) : undefined,
    paymentMethod: method as (typeof registrationPaymentMethods)[number] | undefined,
  };
}
