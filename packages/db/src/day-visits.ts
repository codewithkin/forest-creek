import { z } from "zod";

import { lodgeToday } from "./booking-policy";
import { generateReference, toStayDate } from "./bookings";
import { prisma } from "./client";
import { syncGallery } from "./gallery";
import { notifyDayVisit } from "./notifications";
import { slugSchema } from "./properties";

import type { DayVisit, DayVisitBooking } from "../prisma/generated/client";

export type { DayVisit, DayVisitBooking };

export const MAX_DAY_VISIT_IMAGES = 20;
/** How far ahead a guest may ask for a date. */
export const DAY_VISIT_MAX_DAYS_AHEAD = 730;
export const MAX_DAY_VISIT_GUESTS = 100;

export const dayVisitStatuses = ["requested", "confirmed", "declined", "cancelled"] as const;
export type DayVisitStatus = (typeof dayVisitStatuses)[number];

// ---------------------------------------------------------------------------
// The visits themselves, set up by staff
// ---------------------------------------------------------------------------

/** Whole dollars per person, or null for "price to be announced". */
const pricePerPersonSchema = z.number().int().min(0).max(100_000).nullable();

export const createDayVisitSchema = z.object({
  propertyId: z.string().min(1),
  slug: slugSchema,
  name: z.string().trim().min(1, "Give the day visit a name").max(120),
  description: z.string().trim().min(1, "Describe the day visit").max(2000),
  pricePerPerson: pricePerPersonSchema.default(null),
  currency: z.string().trim().length(3).default("USD"),
  images: z.array(z.string().trim().min(1)).max(MAX_DAY_VISIT_IMAGES).default([]),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export type CreateDayVisitInput = z.input<typeof createDayVisitSchema>;

export const updateDayVisitSchema = createDayVisitSchema
  .extend({ pricePerPerson: pricePerPersonSchema, images: z.array(z.string().trim().min(1)).max(MAX_DAY_VISIT_IMAGES) })
  .partial()
  .extend({ id: z.string().min(1), active: z.boolean().optional() });
export type UpdateDayVisitInput = z.input<typeof updateDayVisitSchema>;

export function getDayVisits(propertyId?: string, includeInactive = false): Promise<DayVisit[]> {
  return prisma.dayVisit.findMany({
    where: {
      propertyId,
      ...(includeInactive ? {} : { active: true, property: { active: true } }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getDayVisitById(id: string): Promise<DayVisit | null> {
  return prisma.dayVisit.findUnique({ where: { id } });
}

export function getDayVisitBySlug(propertyId: string, slug: string): Promise<DayVisit | null> {
  return prisma.dayVisit.findUnique({ where: { propertyId_slug: { propertyId, slug } } });
}

export function createDayVisit(input: CreateDayVisitInput): Promise<DayVisit> {
  const data = syncGallery<z.output<typeof createDayVisitSchema> & { image?: string }>(createDayVisitSchema.parse(input));
  return prisma.dayVisit.create({ data: { ...data, image: data.image ?? "" } });
}

export function updateDayVisit(input: UpdateDayVisitInput): Promise<DayVisit> {
  const { id, ...data } = updateDayVisitSchema.parse(input);
  return prisma.dayVisit.update({ where: { id }, data: syncGallery(data) });
}

export function setDayVisitActive(id: string, active: boolean): Promise<DayVisit> {
  return prisma.dayVisit.update({ where: { id }, data: { active } });
}

/** A real delete, for one added by mistake. Refused once a guest has asked for it: hide it instead. */
export async function deleteDayVisit(id: string): Promise<{ id: string }> {
  const booked = await prisma.dayVisitBooking.findFirst({ where: { dayVisitId: id }, select: { reference: true } });
  if (booked) {
    throw new DayVisitError(
      `Day visit ${booked.reference} was booked for this. Hide it instead of deleting it.`,
      "IN_USE",
    );
  }
  await prisma.dayVisit.delete({ where: { id } });
  return { id };
}

// ---------------------------------------------------------------------------
// Guests asking to come
// ---------------------------------------------------------------------------

export class DayVisitError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_DATE" | "INVALID_STATUS" | "IN_USE" | "REFERENCE_EXHAUSTED",
  ) {
    super(message);
    this.name = "DayVisitError";
  }
}

export const requestDayVisitSchema = z.object({
  dayVisitId: z.string().min(1),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day you would like to come"),
  guests: z.number().int().min(1, "At least one guest").max(MAX_DAY_VISIT_GUESTS, `For more than ${MAX_DAY_VISIT_GUESTS} guests, please call us`),
  guestName: z.string().trim().min(2, "Tell us your name").max(120),
  guestEmail: z.string().trim().toLowerCase().email("Enter a valid email address"),
  guestPhone: z
    .string()
    .trim()
    .min(7, "Enter a phone number we can reach you on")
    .max(30)
    .regex(/^\+?[\d\s()-]+$/, "Enter a phone number using digits only"),
  note: z.string().trim().max(1000).optional(),
  channel: z.enum(["web", "whatsapp"]).default("web"),
});
export type RequestDayVisitInput = z.input<typeof requestDayVisitSchema>;

/** What a reference alone may reveal: never who the guest is, like a stay's payment page. */
export type GuestDayVisitView = {
  reference: string;
  visitName: string;
  propertyName: string;
  visitDate: string;
  guests: number;
  pricePerPerson: number | null;
  status: string;
  staffNote: string | null;
};

function addDays(day: string, days: number): string {
  const date = toStayDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function requestDayVisit(input: RequestDayVisitInput, now: Date = new Date()): Promise<GuestDayVisitView> {
  const data = requestDayVisitSchema.parse(input);
  const visit = await prisma.dayVisit.findUnique({
    where: { id: data.dayVisitId },
    include: { property: { select: { name: true, active: true } } },
  });
  if (!visit || !visit.active || !visit.property.active) {
    throw new DayVisitError("That day visit is not available any more.", "NOT_FOUND");
  }
  const today = lodgeToday(now);
  if (data.visitDate < today) {
    throw new DayVisitError("That day has already passed — choose today or a later date.", "INVALID_DATE");
  }
  if (data.visitDate > addDays(today, DAY_VISIT_MAX_DAYS_AHEAD)) {
    throw new DayVisitError("We take day visits up to two years ahead — choose an earlier date.", "INVALID_DATE");
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const created = await prisma.dayVisitBooking.create({
        data: {
          reference: generateReference("FD"),
          dayVisitId: visit.id,
          propertyId: visit.propertyId,
          visitName: visit.name,
          visitDate: toStayDate(data.visitDate),
          guests: data.guests,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          guestPhone: data.guestPhone,
          note: data.note || null,
          pricePerPerson: visit.pricePerPerson,
          channel: data.channel,
        },
      });
      await notifyDayVisit(created.id, "visit-requested");
      return guestView(created, visit.property.name);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") continue; // reference clash: draw again
      throw error;
    }
  }
  throw new DayVisitError("Could not allocate a day visit reference", "REFERENCE_EXHAUSTED");
}

function guestView(booking: DayVisitBooking, propertyName: string): GuestDayVisitView {
  return {
    reference: booking.reference,
    visitName: booking.visitName,
    propertyName,
    visitDate: booking.visitDate.toISOString().slice(0, 10),
    guests: booking.guests,
    pricePerPerson: booking.pricePerPerson,
    status: booking.status,
    staffNote: booking.staffNote,
  };
}

export async function getGuestDayVisitView(reference: string): Promise<GuestDayVisitView | null> {
  const booking = await prisma.dayVisitBooking.findUnique({
    where: { reference: reference.trim().toUpperCase() },
    include: { property: { select: { name: true } } },
  });
  return booking ? guestView(booking, booking.property.name) : null;
}

// ---------------------------------------------------------------------------
// Staff answering
// ---------------------------------------------------------------------------

export type StaffDayVisitBooking = DayVisitBooking & { propertyName: string };

export async function listDayVisitBookings(options: {
  propertyIds?: string[];
  status?: DayVisitStatus;
  limit?: number;
} = {}): Promise<StaffDayVisitBooking[]> {
  const rows = await prisma.dayVisitBooking.findMany({
    where: {
      ...(options.propertyIds ? { propertyId: { in: options.propertyIds } } : {}),
      ...(options.status ? { status: options.status } : {}),
    },
    include: { property: { select: { name: true } } },
    // Requests still waiting on staff first, then by the day of the visit.
    orderBy: [{ visitDate: "asc" }, { createdAt: "asc" }],
    take: options.limit ?? 200,
  });
  return rows.map(({ property, ...booking }) => ({ ...booking, propertyName: property.name }));
}

export function getDayVisitBookingById(id: string): Promise<DayVisitBooking | null> {
  return prisma.dayVisitBooking.findUnique({ where: { id } });
}

export const answerDayVisitSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["confirmed", "declined", "cancelled"]),
  /** Told to the guest in the email — what to bring, why it was declined. */
  staffNote: z.string().trim().max(1000).optional(),
  /** The per-person price, when confirming a visit whose price was to be announced. */
  pricePerPerson: z.number().int().min(0).max(100_000).optional(),
});
export type AnswerDayVisitInput = z.input<typeof answerDayVisitSchema>;

/** Which answers each state still allows. */
const NEXT: Record<string, readonly string[]> = {
  requested: ["confirmed", "declined", "cancelled"],
  confirmed: ["cancelled"],
  declined: [],
  cancelled: [],
};

export async function answerDayVisit(input: AnswerDayVisitInput, staffEmail: string): Promise<DayVisitBooking> {
  const data = answerDayVisitSchema.parse(input);
  const current = await prisma.dayVisitBooking.findUnique({ where: { id: data.id } });
  if (!current) throw new DayVisitError("No such day visit", "NOT_FOUND");
  if (!NEXT[current.status]?.includes(data.status)) {
    throw new DayVisitError(`${current.reference} is already ${current.status}.`, "INVALID_STATUS");
  }

  // Conditional on the status read above, so two staff answering at once
  // cannot both win — the second finds nothing to update.
  const { count } = await prisma.dayVisitBooking.updateMany({
    where: { id: current.id, status: current.status },
    data: {
      status: data.status,
      staffNote: data.staffNote || current.staffNote,
      ...(data.pricePerPerson !== undefined ? { pricePerPerson: data.pricePerPerson } : {}),
      handledBy: staffEmail,
      handledAt: new Date(),
    },
  });
  if (count === 0) {
    throw new DayVisitError(`${current.reference} was just answered by someone else — refresh to see it.`, "INVALID_STATUS");
  }
  await notifyDayVisit(current.id, `visit-${data.status}`);
  return prisma.dayVisitBooking.findUniqueOrThrow({ where: { id: current.id } });
}
