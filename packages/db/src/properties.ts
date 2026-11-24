import { z } from "zod";

import { updatesOf } from "./update-schema";

import { prisma } from "./client";
import {
  propertySearchSchema,
  rankProperties,
  type PropertySearchInput,
  type PropertySearchResult,
} from "./property-search";

import { parseMapPin } from "./getting-here";

import type { Property } from "../prisma/generated/client";

export type { Property };

/** Top-level web routes a property slug would otherwise shadow (or be shadowed by). */
export const reservedSlugs = ["places", "book", "dashboard", "login", "api", "media", "pay", "policies", "receipt", "day-visits", "menu"] as const;

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "The web address needs at least 2 characters")
  .max(60, "Keep the web address under 60 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens in the web address")
  .refine((slug) => !(reservedSlugs as readonly string[]).includes(slug), {
    message: "That address is used by the site itself — pick another",
  });

export const createPropertySchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  location: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email(),
  heroImage: z.string().trim().min(1, "Add a cover photo"),
  gallery: z.array(z.string().trim().min(1)).max(24).default([]),
  amenities: z.array(z.string().trim().min(1).max(60)).max(24).default([]),
  sortOrder: z.number().int().min(0).max(999).default(0),
  // Getting here — see getting-here.ts. A pin is both coordinates or neither.
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  directions: z.string().trim().max(2000).nullable().optional(),
  travelDistances: z.array(z.string().trim().min(1).max(120)).max(12).optional(),
  breakfastIncluded: z.boolean().optional(),
  /**
   * What staff paste for the pin — coordinates or a Google Maps link — read
   * here into latitude/longitude. Empty clears the pin.
   */
  mapPin: z
    .string()
    .trim()
    .max(2000)
    .refine((text) => text === "" || parseMapPin(text) !== null, {
      message:
        "That isn't a map pin we can read. In Google Maps, press and hold the lodge, then copy the numbers it shows (like -19.0812, 32.7465) — or paste the full link from the address bar.",
    })
    .optional(),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = updatesOf(createPropertySchema).extend({
  id: z.string().min(1),
  active: z.boolean().optional(),
});

export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export function getProperties(includeInactive = false): Promise<Property[]> {
  return prisma.property.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/**
 * The public /places listing. Text and location narrow in SQL; price and party
 * size are judged per room in rankProperties. The group runs a handful of
 * houses, so ranking the narrowed set in memory is cheaper than the SQL a
 * min-room-price sort would take — revisit if it ever reaches hundreds.
 */
export async function searchProperties(
  input: PropertySearchInput,
): Promise<PropertySearchResult<Property>> {
  const filters = propertySearchSchema.parse(input);
  const text = filters.q
    ? { contains: filters.q, mode: "insensitive" as const }
    : undefined;

  const rows = await prisma.property.findMany({
    where: {
      active: true,
      ...(filters.location ? { location: filters.location } : {}),
      ...(text
        ? {
            OR: [
              { name: text },
              { tagline: text },
              { location: text },
              { description: text },
            ],
          }
        : {}),
    },
    include: {
      rooms: { where: { active: true }, select: { pricePerNight: true, capacity: true } },
    },
  });

  return rankProperties(rows, filters);
}

/** What the /places filters can offer: real locations and the real price span. */
export async function getPropertyFacets() {
  const [locations, prices] = await Promise.all([
    prisma.property.findMany({
      where: { active: true },
      distinct: ["location"],
      select: { location: true },
      orderBy: { location: "asc" },
    }),
    prisma.room.aggregate({
      where: { active: true, property: { active: true } },
      _min: { pricePerNight: true },
      _max: { pricePerNight: true },
    }),
  ]);

  return {
    locations: locations.map((row) => row.location),
    minPrice: prices._min.pricePerNight ?? 0,
    maxPrice: prices._max.pricePerNight ?? 0,
  };
}

export function getPropertyById(id: string): Promise<Property | null> {
  return prisma.property.findUnique({ where: { id } });
}

export function getPropertyBySlug(slug: string): Promise<Property | null> {
  return prisma.property.findUnique({ where: { slug } });
}

/** Turns a pasted mapPin into the coordinates it names; leaves the rest as given. */
function withPin<T extends { mapPin?: string; latitude?: number | null; longitude?: number | null }>(data: T) {
  const { mapPin, ...rest } = data;
  if (mapPin === undefined) return rest;
  const pin = mapPin === "" ? null : parseMapPin(mapPin);
  return { ...rest, latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null };
}

export function createProperty(input: CreatePropertyInput): Promise<Property> {
  return prisma.property.create({ data: withPin(createPropertySchema.parse(input)) });
}

export function updateProperty(input: UpdatePropertyInput): Promise<Property> {
  const { id, ...data } = updatePropertySchema.parse(input);
  return prisma.property.update({ where: { id }, data: withPin(data) });
}

/**
 * A real delete, for a property added by mistake. Its rooms, experiences, day
 * visits, blocked dates and manager links go with it; chats keep their text
 * but lose the property.
 *
 * Refused once any guest has booked a stay or asked for a day visit there —
 * those are the guest's record and the money trail, so hide the property instead.
 */
export async function deleteProperty(id: string): Promise<{ id: string }> {
  const [stay, visit] = await Promise.all([
    prisma.booking.findFirst({ where: { propertyId: id }, select: { reference: true } }),
    prisma.dayVisitBooking.findFirst({ where: { propertyId: id }, select: { reference: true } }),
  ]);
  const reference = stay?.reference ?? visit?.reference;
  if (reference) {
    throw new PropertyInUseError(
      `${stay ? "Booking" : "Day visit"} ${reference} was made here. Hide the property instead of deleting it.`,
    );
  }
  await prisma.property.delete({ where: { id } });
  return { id };
}

export class PropertyInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PropertyInUseError";
  }
}

/** Properties a staff member may act on. Admins are not scoped to any subset. */
export async function getPropertyIdsForStaff(
  userId: string,
  role: string,
): Promise<string[] | "all"> {
  if (role === "admin") return "all";
  const rows = await prisma.staffProperty.findMany({
    where: { userId },
    select: { propertyId: true },
  });
  return rows.map((row) => row.propertyId);
}

export function assignStaffToProperty(userId: string, propertyId: string) {
  return prisma.staffProperty.upsert({
    where: { userId_propertyId: { userId, propertyId } },
    update: {},
    create: { userId, propertyId },
  });
}

export function removeStaffFromProperty(userId: string, propertyId: string) {
  return prisma.staffProperty.deleteMany({ where: { userId, propertyId } });
}
