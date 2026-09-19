// Import-free so it can be unit tested without a database or env. The query
// half lives in properties.ts; this is the part with actual rules in it.
import { z } from "zod";

export const propertySorts = ["recommended", "price-asc", "price-desc", "name"] as const;
export type PropertySort = (typeof propertySorts)[number];

export const PROPERTY_PAGE_SIZE = 10;

export const propertySearchSchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    location: z.string().trim().max(160).optional(),
    minPrice: z.number().int().min(0).max(100_000).optional(),
    maxPrice: z.number().int().min(0).max(100_000).optional(),
    guests: z.number().int().min(1).max(40).optional(),
    sort: z.enum(propertySorts).default("recommended"),
    page: z.number().int().min(1).max(1000).default(1),
    pageSize: z.number().int().min(1).max(48).default(PROPERTY_PAGE_SIZE),
  })
  .default({ sort: "recommended", page: 1, pageSize: PROPERTY_PAGE_SIZE });

export type PropertySearchInput = z.input<typeof propertySearchSchema>;
export type PropertySearchFilters = z.output<typeof propertySearchSchema>;

type SearchableRoom = { pricePerNight: number; capacity: number };

export type SearchableProperty = {
  id: string;
  name: string;
  sortOrder: number;
  rooms: SearchableRoom[];
};

export type PropertyMatch<P> = Omit<P, "rooms"> & {
  /** Cheapest room that satisfies the filters; null when no rooms are published. */
  fromPrice: number | null;
  toPrice: number | null;
  roomCount: number;
  maxCapacity: number;
};

export type PropertySearchResult<P> = {
  items: PropertyMatch<P>[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

function roomFits(room: SearchableRoom, filters: PropertySearchFilters): boolean {
  if (filters.minPrice !== undefined && room.pricePerNight < filters.minPrice) return false;
  if (filters.maxPrice !== undefined && room.pricePerNight > filters.maxPrice) return false;
  if (filters.guests !== undefined && room.capacity < filters.guests) return false;
  return true;
}

/**
 * Applies the room-level filters (price, party size), prices each property
 * from the rooms that actually fit, sorts and cuts one page. A property only
 * matches a price or guest filter through a room that satisfies ALL of them,
 * so "from $90" never advertises a room the guest filtered out.
 */
export function rankProperties<P extends SearchableProperty>(
  properties: P[],
  input: PropertySearchInput,
): PropertySearchResult<P> {
  const filters = propertySearchSchema.parse(input);
  const roomFiltered =
    filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.guests !== undefined;

  const matches: PropertyMatch<P>[] = [];
  for (const { rooms, ...property } of properties) {
    const fitting = rooms.filter((room) => roomFits(room, filters));
    if (roomFiltered && fitting.length === 0) continue;
    const prices = fitting.map((room) => room.pricePerNight);
    matches.push({
      ...property,
      fromPrice: prices.length ? Math.min(...prices) : null,
      toPrice: prices.length ? Math.max(...prices) : null,
      roomCount: rooms.length,
      maxCapacity: rooms.reduce((max, room) => Math.max(max, room.capacity), 0),
    });
  }

  // Unpriced properties sink to the end of a price sort in both directions.
  const price = (match: PropertyMatch<P>, empty: number) => match.fromPrice ?? empty;
  const byName = (a: PropertyMatch<P>, b: PropertyMatch<P>) => a.name.localeCompare(b.name);
  const sorters: Record<PropertySort, (a: PropertyMatch<P>, b: PropertyMatch<P>) => number> = {
    recommended: (a, b) => a.sortOrder - b.sortOrder || byName(a, b),
    "price-asc": (a, b) => price(a, Infinity) - price(b, Infinity) || byName(a, b),
    "price-desc": (a, b) => price(b, -Infinity) - price(a, -Infinity) || byName(a, b),
    name: byName,
  };
  matches.sort(sorters[filters.sort]);

  const total = matches.length;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  // An out-of-range page (a stale link after filters narrowed) lands on the last one.
  const page = Math.min(filters.page, pageCount);
  const start = (page - 1) * filters.pageSize;

  return {
    items: matches.slice(start, start + filters.pageSize),
    total,
    page,
    pageSize: filters.pageSize,
    pageCount,
  };
}
