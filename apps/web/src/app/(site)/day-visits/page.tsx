import type { Metadata } from "next";

import DayVisitPlanner from "@/components/day-visits/day-visit-planner";
import SplitWords from "@/components/motion/split-words";
import { reveal } from "@/components/motion/reveal";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Day Visits — Forest Creek",
  description:
    "Spend a day at Forest Creek in the Vumba highlands — the gardens, the grounds and good company, without a night's stay.",
};

export default async function DayVisitsPage() {
  const [properties, visits] = await Promise.all([api.properties.list.query(), api.dayVisits.list.query()]);

  return (
    <>
      <section className="px-3 pt-3 sm:px-5">
        <div className="relative isolate mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] border border-border/60 sm:rounded-[2.5rem]">
          <img
            src="/images/view.jpeg"
            alt=""
            className="absolute inset-0 -z-20 h-full w-full animate-ken-burns object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-background/30" />
          <div className="max-w-2xl px-6 py-16 sm:px-12 sm:py-24">
            <span className="inline-flex animate-blur-in rounded-full border border-white/20 bg-background/40 px-3 py-1 text-xs tracking-[0.2em] text-accent uppercase backdrop-blur-md">
              Day visits
            </span>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] font-light sm:text-6xl">
              <SplitWords text="Come for" delayMs={100} />{" "}
              <em className="text-accent">
                <SplitWords text="the day" delayMs={100} startIndex={2} />
              </em>
            </h1>
            <p className="mt-5 max-w-md animate-fade-up text-foreground/75" style={{ animationDelay: "400ms" }}>
              No overnight stay needed. Spend a day in the gardens and grounds with family and friends — choose a
              day visit, tell us when you&rsquo;d like to come, and we&rsquo;ll confirm it with you.
            </p>
          </div>
        </div>
      </section>

      {/* The reveal script can mark this shown before hydration when it is in view at once. */}
      <div className="mx-auto max-w-6xl px-5 py-16" {...reveal("up")} suppressHydrationWarning>
        <DayVisitPlanner
          visits={visits}
          properties={properties.map(({ id, name, location, heroImage }) => ({ id, name, location, heroImage }))}
        />
      </div>
    </>
  );
}
