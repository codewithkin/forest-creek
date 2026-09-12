import type { Metadata } from "next";

import BookingWizard from "@/components/booking/booking-wizard";
import { api } from "@/lib/api";

// Rendered per request, never prerendered: rooms, rates and activities come from
// the API, which is not running during the image build and whose rows change
// without a redeploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book Your Stay — Forest Creek Lodge",
  description: "Reserve a room at Forest Creek Lodge in the Vumba highlands of Zimbabwe.",
};

export default async function BookPage() {
  const [rooms, activities] = await Promise.all([
    api.rooms.list.query(),
    api.activities.list.query(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">Reservations</span>
      <h1 className="mt-4 font-display text-4xl font-light sm:text-5xl">Begin your journey</h1>

      <div className="mt-12">
        <BookingWizard rooms={rooms} activities={activities} />
      </div>
    </div>
  );
}
