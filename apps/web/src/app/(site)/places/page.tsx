import { Compass, SearchX } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/brand/button";
import { StateMessage } from "@/components/brand/state";
import SplitWords from "@/components/motion/split-words";
import { reveal, stagger } from "@/components/motion/reveal";
import Pagination from "@/components/places/pagination";
import PlaceCard from "@/components/places/place-card";
import PlacesExplorer from "@/components/places/places-explorer";
import { api } from "@/lib/api";
import { hasFilters, parsePlacesQuery, placesHref, toSearchInput } from "@/lib/places-query";

// Reads the API per request: rates and listings change without a deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Our places — Forest Creek",
  description: "Every Forest Creek house in the Vumba, with rates, sleeping space and locations.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PlacesPage({ searchParams }: Props) {
  const query = parsePlacesQuery(await searchParams);
  const [result, facets] = await Promise.all([
    api.properties.search.query(toSearchInput(query)),
    api.properties.facets.query(),
  ]);

  const filtered = hasFilters(query);
  const first = (result.page - 1) * result.pageSize + 1;
  const last = first + result.items.length - 1;

  return (
    <section className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-secondary/60 to-transparent" />

      <div className="mx-auto max-w-6xl px-5 pt-14 pb-24 sm:pt-20">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="text-xs tracking-[0.2em] text-accent uppercase">Our places</span>
            <h1 className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-5xl md:text-6xl">
              <SplitWords text="Find your corner of the Vumba" />
            </h1>
            <p className="mt-4 animate-fade-up leading-relaxed text-muted-foreground" style={{ animationDelay: "350ms" }}>
              Each house keeps its own character. Filter by what matters for this trip.
            </p>
          </div>
          <p className="shrink-0 text-sm text-muted-foreground" aria-live="polite">
            <span className="font-display text-3xl text-foreground">{result.total}</span>{" "}
            {result.total === 1 ? "place" : "places"}
            {query.location && <> in {query.location.split(",")[0]}</>}
          </p>
        </div>

        <div className="mt-10 animate-fade-up" style={{ animationDelay: "450ms" }}>
          <PlacesExplorer query={query} facets={facets}>
            {result.items.length === 0 ? (
              <StateMessage
                icon={filtered ? SearchX : Compass}
                title={filtered ? "No places match those filters" : "New places are on the way"}
                description={
                  filtered
                    ? "Try a wider price range, a smaller group size or a different area — or ask The Vumba Guide in the chat for a suggestion."
                    : "We're getting our houses ready for guests. In the meantime, send us a message and we'll help you plan."
                }
                className="mt-10 bg-card/40 py-20"
                action={
                  filtered ? (
                    <Link
                      href={placesHref({ sort: query.sort }) as Route}
                      className={buttonClass({ variant: "secondary", shape: "pill" })}
                    >
                      Clear all filters
                    </Link>
                  ) : (
                    <Link href="/" className={buttonClass({ variant: "secondary", shape: "pill" })}>
                      Back to home
                    </Link>
                  )
                }
              />
            ) : (
              <>
                <p className="mt-8 text-xs text-muted-foreground">
                  Showing {first}–{last} of {result.total}
                </p>
                <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {result.items.map((place, index) => (
                    <li key={place.id} {...reveal("up", stagger(index, 80))}>
                      <PlaceCard place={place} />
                    </li>
                  ))}
                </ul>
                <Pagination query={query} page={result.page} pageCount={result.pageCount} />
              </>
            )}
          </PlacesExplorer>
        </div>
      </div>
    </section>
  );
}
