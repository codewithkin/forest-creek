"use client";

import { ChevronDown, Loader2, Search, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  hasFilters,
  placesHref,
  priceBands,
  priceLabel,
  sortLabels,
  type PlacesQuery,
  type PropertySort,
} from "@/lib/places-query";

type Facets = { locations: string[]; minPrice: number; maxPrice: number };

const GUEST_OPTIONS = [1, 2, 3, 4, 6, 8];

/**
 * Filters live in the URL, so every result set is linkable and the back button
 * works. Changing one replaces the route inside a transition: the server page
 * re-renders with the new results while the old ones dim instead of vanishing.
 */
export default function PlacesExplorer({
  query,
  facets,
  children,
}: {
  query: PlacesQuery;
  facets: Facets;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(query.q ?? "");

  // A "clear" link or the back button changes q underneath the input.
  useEffect(() => setText(query.q ?? ""), [query.q]);

  function apply(patch: Partial<PlacesQuery>) {
    // Any filter change starts again from the first page.
    const next = { ...query, ...patch, page: undefined };
    startTransition(() => router.replace(placesHref(next) as Route, { scroll: false }));
  }

  // Search as the guest types, without a request per keystroke.
  useEffect(() => {
    const value = text.trim();
    if (value === (query.q ?? "")) return;
    const timer = setTimeout(() => apply({ q: value || undefined }), 350);
    return () => clearTimeout(timer);
    // Keyed on the text alone: apply always reads the latest query.
  }, [text]);

  const bands = priceBands(facets.minPrice, facets.maxPrice);
  const currentBand = bands.findIndex(
    (band) => band.minPrice === query.minPrice && band.maxPrice === query.maxPrice,
  );
  const customPrice = currentBand === -1 ? priceLabel(query) : undefined;

  const chips: Array<{ label: string; clear: Partial<PlacesQuery> }> = [];
  if (query.q) chips.push({ label: `“${query.q}”`, clear: { q: undefined } });
  if (query.location) chips.push({ label: query.location, clear: { location: undefined } });
  const price = priceLabel(query);
  if (price) chips.push({ label: price, clear: { minPrice: undefined, maxPrice: undefined } });
  if (query.guests) {
    chips.push({
      label: `${query.guests}+ ${query.guests === 1 ? "guest" : "guests"}`,
      clear: { guests: undefined },
    });
  }

  return (
    <>
      <div className="rounded-2xl border border-border/70 bg-card/80 p-2.5 shadow-lg shadow-black/10 backdrop-blur-sm sm:p-3">
        <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
          <label className="relative block">
            <span className="sr-only">Search places</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Search by name, area or feel…"
              className="h-11 w-full rounded-xl border border-input bg-background/60 pr-10 pl-11 text-sm outline-none placeholder:text-muted-foreground/80 focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            {pending && (
              <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-accent" />
            )}
          </label>

          <div className="grid grid-cols-2 gap-2.5 lg:contents">
            <FilterSelect
              label="Location"
              value={query.location ?? ""}
              onChange={(value) => apply({ location: value || undefined })}
            >
              <option value="">Anywhere</option>
              {facets.locations.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
              {/* A shared link can name a place we no longer list. */}
              {query.location && !facets.locations.includes(query.location) && (
                <option value={query.location}>{query.location}</option>
              )}
            </FilterSelect>

            <FilterSelect
              label="Price per night"
              value={customPrice ? "custom" : String(currentBand)}
              onChange={(value) => {
                const band = bands[Number(value)];
                apply({ minPrice: band?.minPrice, maxPrice: band?.maxPrice });
              }}
            >
              <option value="-1">Any price</option>
              {bands.map((band, index) => (
                <option key={band.label} value={index}>
                  {band.label}
                </option>
              ))}
              {customPrice && <option value="custom">{customPrice}</option>}
            </FilterSelect>

            <FilterSelect
              label="Guests"
              value={query.guests ? String(query.guests) : ""}
              onChange={(value) => apply({ guests: value ? Number(value) : undefined })}
            >
              <option value="">Any group size</option>
              {GUEST_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {count}+ {count === 1 ? "guest" : "guests"}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Sort by"
              value={query.sort ?? "recommended"}
              onChange={(value) => apply({ sort: value as PropertySort })}
            >
              {Object.entries(sortLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>
      </div>

      {hasFilters(query) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => apply(chip.clear)}
              className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 py-1 pr-2 pl-3 text-xs text-accent transition-colors hover:border-accent/60"
            >
              <span className="truncate">{chip.label}</span>
              <X className="size-3 shrink-0 opacity-70 group-hover:opacity-100" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setText("");
              startTransition(() =>
                router.replace(placesHref({ sort: query.sort }) as Route, { scroll: false }),
              );
            }}
            className="px-2 py-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div
        aria-busy={pending}
        className={`transition-opacity duration-300 ${pending ? "pointer-events-none opacity-50" : ""}`}
      >
        {children}
      </div>
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block min-w-0 rounded-xl border border-input bg-background/60 transition-colors focus-within:border-accent/60 hover:border-accent/40">
      <span className="pointer-events-none absolute top-1.5 left-3.5 text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full cursor-pointer appearance-none truncate rounded-xl bg-transparent pt-3.5 pr-9 pl-3.5 text-sm outline-none [&>option]:bg-popover"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </label>
  );
}
