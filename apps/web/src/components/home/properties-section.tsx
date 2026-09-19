import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { reveal } from "@/components/motion/reveal";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/server-url";

/** The landing page shows a taste; /places has the full, filterable list. */
const PREVIEW_COUNT = 3;

/**
 * An editorial zig-zag: each house gets a wide photograph and a numbered
 * caption, alternating sides, sliding in from its own edge.
 */
export default async function PropertiesSection() {
  const all = await api.properties.list.query();
  const properties = all.slice(0, PREVIEW_COUNT);

  return (
    <section id="places" className="scroll-mt-24 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span {...reveal("up")} className="text-xs tracking-[0.2em] text-accent uppercase">
              Our places
            </span>
            <h2
              {...reveal("up", 80)}
              className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-6xl"
            >
              {properties.length === 1 ? (
                "Where you will stay"
              ) : (
                <>
                  Houses with their <em className="text-accent">own character</em>
                </>
              )}
            </h2>
          </div>
          <Link
            {...reveal("left", 160)}
            href="/places"
            className="group inline-flex shrink-0 items-center gap-3 self-start rounded-full border border-border py-1.5 pr-1.5 pl-5 text-sm transition-colors hover:border-accent/60 md:self-auto"
          >
            {all.length > PREVIEW_COUNT ? `Browse all ${all.length} places` : "Browse & filter places"}
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary transition-all duration-500 group-hover:-rotate-45 group-hover:bg-accent group-hover:text-accent-foreground">
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </div>

        <ol className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
          {properties.map((property, index) => {
            const flip = index % 2 === 1;
            return (
              <li key={property.id}>
                <Link
                  href={`/${property.slug}` as Route}
                  className="group grid items-center gap-8 md:grid-cols-12 md:gap-12"
                >
                  <div
                    {...reveal("curtain")}
                    className={`relative overflow-hidden rounded-3xl md:col-span-7 ${flip ? "md:order-2" : ""}`}
                  >
                    <img
                      src={mediaUrl(property.heroImage)}
                      alt={property.name}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-soft)] group-hover:scale-[1.06] md:aspect-[16/11]"
                    />
                    <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-background/75 px-3 py-1.5 text-xs backdrop-blur-md">
                      <MapPin className="size-3.5 text-accent" />
                      {property.location.split(",")[0]}
                    </span>
                    <span className="absolute right-4 bottom-4 flex size-12 translate-y-2 items-center justify-center rounded-full bg-accent text-accent-foreground opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                      <ArrowUpRight className="size-5" />
                    </span>
                  </div>

                  <div
                    {...reveal(flip ? "right" : "left", 150)}
                    className={`md:col-span-5 ${flip ? "md:order-1 md:text-right" : ""}`}
                  >
                    <span className="font-display text-7xl leading-none text-accent/25 italic sm:text-8xl">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-2 font-display text-3xl transition-colors group-hover:text-accent sm:text-4xl">
                      {property.name}
                    </h3>
                    <p className="mt-3 font-display text-xl text-muted-foreground italic">
                      {property.tagline}
                    </p>
                    <p className="mt-4 line-clamp-3 leading-relaxed text-muted-foreground">
                      {property.description}
                    </p>
                    {property.amenities.length > 0 && (
                      <ul className={`mt-6 flex flex-wrap gap-2 ${flip ? "md:justify-end" : ""}`}>
                        {property.amenities.slice(0, 4).map((amenity) => (
                          <li
                            key={amenity}
                            className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground"
                          >
                            {amenity}
                          </li>
                        ))}
                      </ul>
                    )}
                    <span className="mt-8 inline-flex items-center gap-2 text-sm text-accent">
                      Explore {property.name}
                      <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1.5" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
