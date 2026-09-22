import { ArrowUpRight, BedDouble, MapPin, Users } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import Photo from "@/components/media/photo";

export type PlaceSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  location: string;
  heroImage: string;
  gallery: string[];
  amenities: string[];
  fromPrice: number | null;
  toPrice: number | null;
  roomCount: number;
  maxCapacity: number;
};

/** The first part of an address ("Vumba Mountains, Mutare, …") reads best on a badge. */
function shortLocation(location: string): string {
  return location.split(",")[0]?.trim() || location;
}

export default function PlaceCard({ place }: { place: PlaceSummary }) {
  const photos = 1 + place.gallery.length;

  return (
    <Link
      href={`/${place.slug}` as Route}
      className="group flex flex-col rounded-[1.4rem] border border-border/70 bg-card p-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-xl hover:shadow-black/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-secondary">
        <Photo
          src={place.heroImage}
          alt={place.name}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1.5 p-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium backdrop-blur-sm">
            <MapPin className="size-3 text-accent" aria-hidden />
            {shortLocation(place.location)}
          </span>
          {photos > 1 && (
            <span className="rounded-full bg-background/80 px-2.5 py-1 text-[11px] backdrop-blur-sm">
              {photos} photos
            </span>
          )}
        </div>
        <span className="absolute right-3 bottom-3 flex size-9 translate-y-1 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" aria-hidden />
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 py-2">
          <BedDouble className="size-3.5 text-accent" aria-hidden />
          {place.roomCount} {place.roomCount === 1 ? "room" : "rooms"}
        </span>
        <span className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 py-2">
          <Users className="size-3.5 text-accent" aria-hidden />
          {place.maxCapacity > 0 ? `Sleeps up to ${place.maxCapacity}` : "Ask about sleeping"}
        </span>
      </div>

      <div className="mt-1.5 flex flex-1 items-end justify-between gap-4 rounded-xl bg-secondary/50 px-4 py-3.5">
        <div className="min-w-0">
          <h3 className="truncate font-display text-xl leading-tight">{place.name}</h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{place.tagline}</p>
        </div>
        <p className="shrink-0 text-right">
          {place.fromPrice !== null ? (
            <>
              <span className="block text-[10px] tracking-wider text-muted-foreground uppercase">
                from
              </span>
              <span className="font-display text-2xl leading-none text-accent">
                ${place.fromPrice}
              </span>
              <span className="text-xs text-muted-foreground"> /night</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Rates on request</span>
          )}
        </p>
      </div>
    </Link>
  );
}
