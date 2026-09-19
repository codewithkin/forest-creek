import type { AppRouter } from "@forest-creek/api/routers/index";
import type { inferRouterInputs } from "@trpc/server";

type PropertySearchInput = Exclude<inferRouterInputs<AppRouter>["properties"]["search"], void | undefined>;
export type PropertySort = NonNullable<PropertySearchInput["sort"]>;

/** Three columns at desktop, two on tablet: 12 fills every row. */
export const PLACES_PAGE_SIZE = 12;

export const sortLabels: Record<PropertySort, string> = {
  recommended: "Recommended",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  name: "Name A–Z",
};

export type PlacesQuery = {
  q?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  guests?: number;
  sort?: PropertySort;
  page?: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function whole(value: string | string[] | undefined, min: number, max: number) {
  const raw = one(value);
  if (raw === undefined) return undefined;
  const number = Number(raw);
  if (!Number.isInteger(number) || number < min || number > max) return undefined;
  return number;
}

/**
 * Anything a guest can type into the address bar ends up here, so every field
 * is validated and junk is dropped rather than turned into an API error page.
 */
export function parsePlacesQuery(params: RawParams): PlacesQuery {
  const sort = one(params.sort);
  return {
    q: one(params.q)?.slice(0, 120),
    location: one(params.location)?.slice(0, 160),
    minPrice: whole(params.minPrice, 0, 100_000),
    maxPrice: whole(params.maxPrice, 0, 100_000),
    guests: whole(params.guests, 1, 40),
    sort: sort && sort in sortLabels ? (sort as PropertySort) : undefined,
    page: whole(params.page, 1, 1000),
  };
}

export function toSearchInput(query: PlacesQuery): PropertySearchInput {
  return { ...query, pageSize: PLACES_PAGE_SIZE };
}

/** The /places URL for a query, leaving defaults out so links stay short. */
export function placesHref(query: PlacesQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.location) params.set("location", query.location);
  if (query.minPrice !== undefined) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice !== undefined) params.set("maxPrice", String(query.maxPrice));
  if (query.guests !== undefined) params.set("guests", String(query.guests));
  if (query.sort && query.sort !== "recommended") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `/places?${search}` : "/places";
}

export function hasFilters(query: PlacesQuery): boolean {
  return Boolean(
    query.q ||
      query.location ||
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.guests !== undefined,
  );
}

export type PriceBand = { label: string; minPrice?: number; maxPrice?: number };

/**
 * Price choices cut from the group's real rate span, in round $50 steps, so a
 * guest never picks a band that cannot contain a single room.
 */
export function priceBands(min: number, max: number): PriceBand[] {
  if (max <= 0 || max === min) return [];
  const step = 50;
  // The first band always holds at least the cheapest room.
  const low = Math.floor(min / step) * step + step;
  const bands: PriceBand[] = [{ label: `Under $${low}`, maxPrice: low - 1 }];
  let edge = low;
  // At most four bands between the cheapest and dearest room.
  const width = Math.max(step, Math.ceil((max - low) / 3 / step) * step);
  while (edge + width < max) {
    bands.push({ label: `$${edge}–$${edge + width - 1}`, minPrice: edge, maxPrice: edge + width - 1 });
    edge += width;
  }
  bands.push({ label: `$${edge}+`, minPrice: edge });
  return bands;
}

export function priceLabel(query: PlacesQuery): string | undefined {
  const { minPrice, maxPrice } = query;
  if (minPrice === undefined && maxPrice === undefined) return undefined;
  if (minPrice === undefined) return `Under $${(maxPrice ?? 0) + 1}`;
  if (maxPrice === undefined) return `$${minPrice}+`;
  return `$${minPrice}–$${maxPrice}`;
}
