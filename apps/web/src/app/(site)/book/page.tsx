import type { Metadata } from "next";

import BookingWizard from "@/components/booking/booking-wizard";
import SplitWords from "@/components/motion/split-words";
import { reveal } from "@/components/motion/reveal";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book Your Stay — Forest Creek",
  description: "Reserve a room at one of our lodges in the Vumba highlands of Zimbabwe.",
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const { property: slug } = await searchParams;
  const [properties, rooms, activities] = await Promise.all([
    api.properties.list.query(),
    api.rooms.list.query(),
    api.activities.list.query(),
  ]);

  const preselected = slug ? properties.find((property) => property.slug === slug) : undefined;

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
              Reservations
            </span>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] font-light sm:text-6xl">
              <SplitWords text="Begin your" delayMs={100} />{" "}
              <em className="text-accent">
                <SplitWords text="journey" delayMs={100} startIndex={2} />
              </em>
            </h1>
            <p
              className="mt-5 max-w-md animate-fade-up text-foreground/75"
              style={{ animationDelay: "400ms" }}
            >
              Choose a house, your dates and a room. The full price is shown before you pay, and a
              50% deposit secures your stay.
            </p>
          </div>
        </div>
      </section>

    <div className="mx-auto max-w-6xl px-5 py-16">
      <div {...reveal("up")}>
        <BookingWizard
          properties={properties}
          rooms={rooms}
          activities={activities}
          initialPropertyId={preselected?.id}
        />
      </div>
    </div>
    </>
  );
}
