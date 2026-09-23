import type { Metadata } from "next";
import { notFound } from "next/navigation";

import PayBooking from "@/components/booking/pay-booking";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

// A payment page is reached from a link sent to one guest; search engines
// have no business listing it.
export const metadata: Metadata = {
  title: "Pay for your stay — Forest Creek",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ reference: string }> };

export default async function PayPage({ params }: Params) {
  const { reference } = await params;
  const booking = await api.bookings.byReference.query(decodeURIComponent(reference));
  if (!booking) notFound();

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">Payment</span>
      <h1 className="mt-4 font-display text-4xl font-light sm:text-5xl">Your stay</h1>
      <div className="mt-10">
        <PayBooking booking={booking} />
      </div>
    </div>
  );
}
