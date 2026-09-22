import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import ActivityCard from "@/components/activity-card";
import { reveal, stagger } from "@/components/motion/reveal";
import { api } from "@/lib/api";

/** Enough to show the range without turning the landing page into a catalogue. */
const PREVIEW_COUNT = 4;

/**
 * What there is to do, across the whole group. Each card carries the property
 * it belongs to, because an experience is tied to one house — a braai at one
 * is not a braai at the other.
 */
export default async function ExperiencesSection() {
  const [properties, activities] = await Promise.all([
    api.properties.list.query(),
    api.activities.list.query(),
  ]);

  if (activities.length === 0) return null;

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const shown = activities.slice(0, PREVIEW_COUNT);

  return (
    <section id="experiences" className="scroll-mt-24 bg-popover/50 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span {...reveal("up")} className="text-xs tracking-[0.2em] text-accent uppercase">
              Experiences
            </span>
            <h2
              {...reveal("up", 80)}
              className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-6xl"
            >
              Things to do, <em className="text-accent">once you are here</em>
            </h2>
            <p {...reveal("up", 160)} className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
              A braai on the lawn, the pool under the canopy, the castle up for the children. Some
              come with the stay, some you add while you book.
            </p>
          </div>
          <Link
            {...reveal("left", 160)}
            href="/book"
            className="group inline-flex shrink-0 items-center gap-3 self-start rounded-full border border-border py-1.5 pr-1.5 pl-5 text-sm transition-colors hover:border-accent/60 md:self-auto"
          >
            Add them to a stay
            <span className="flex size-8 items-center justify-center rounded-full bg-secondary transition-all duration-500 group-hover:-rotate-45 group-hover:bg-accent group-hover:text-accent-foreground">
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </div>

        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((activity, index) => {
            const property = propertyById.get(activity.propertyId);
            return (
              <li key={activity.id} {...reveal("up", stagger(index, 110))}>
                {property && (
                  <Link
                    href={`/${property.slug}#activities` as Route}
                    className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-accent"
                  >
                    {property.name}
                    <ArrowRight className="size-3" />
                  </Link>
                )}
                <ActivityCard activity={activity} />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
