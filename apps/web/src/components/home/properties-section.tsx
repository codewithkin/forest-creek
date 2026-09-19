import { ArrowRight, MapPin } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/server-url";

function resolve(image: string): string {
  return image.startsWith("http") ? image : mediaUrl(image);
}

/** The landing page shows a taste; /places has the full, filterable list. */
const PREVIEW_COUNT = 4;

export default async function PropertiesSection() {
  const all = await api.properties.list.query();
  const properties = all.slice(0, PREVIEW_COUNT);

  return (
    <section id="places" className="scroll-mt-20 border-t border-border/60 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <span className="text-xs tracking-[0.2em] text-accent uppercase">Our places</span>
          <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">
            {properties.length === 1 ? "Where you will stay" : "Two ways into the mountain"}
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            Each house keeps its own character — pick the one that suits the trip.
          </p>
        </div>
        <Link
          href="/places"
          className="group inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-border px-5 py-2.5 text-sm transition-colors hover:border-accent/60 hover:text-accent md:self-auto"
        >
          {all.length > PREVIEW_COUNT ? `Browse all ${all.length} places` : "Browse & filter places"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          {properties.map((property) => (
            <Link
              key={property.id}
              href={`/${property.slug}` as Route}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card transition-colors hover:border-accent/50"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={resolve(property.heroImage)}
                  alt={property.name}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>

              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-2xl">{property.name}</h3>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-accent" />
                  {property.location}
                </p>
                <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">
                  {property.tagline}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm text-accent">
                  Explore {property.name}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
