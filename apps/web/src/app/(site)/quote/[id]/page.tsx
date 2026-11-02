import type { Metadata } from "next";
import { notFound } from "next/navigation";

import QuoteResponse from "@/components/booking/quote-response";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

// Reached from a link sent to one guest; search engines have no business listing it.
export const metadata: Metadata = {
  title: "Your quotation — Forest Creek",
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ id: string }> };

export default async function QuotePage({ params }: Params) {
  const { id } = await params;
  const quote = await api.quotes.view.query(decodeURIComponent(id)).catch(() => null);
  if (!quote) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-5">
      <span className="text-xs tracking-[0.2em] text-accent uppercase">{quote.property.name}</span>
      <h1 className="mt-3 font-display text-4xl font-light sm:text-5xl">Your quotation</h1>
      <div className="mt-8">
        <QuoteResponse quote={quote} />
      </div>
    </div>
  );
}
