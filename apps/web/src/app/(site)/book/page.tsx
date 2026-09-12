import type { Metadata } from "next";

import BookingWizard from "@/components/booking/booking-wizard";
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
    <div className="mx-auto max-w-6xl px-5 py-16">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">Reservations</span>
      <h1 className="mt-4 font-display text-4xl font-light sm:text-5xl">Begin your journey</h1>

      <div className="mt-12">
        <BookingWizard
          properties={properties}
          rooms={rooms}
          activities={activities}
          initialPropertyId={preselected?.id}
        />
      </div>
    </div>
  );
}
