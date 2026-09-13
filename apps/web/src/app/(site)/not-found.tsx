import type { Metadata } from "next";
import Link from "next/link";

import { buttonClass } from "@/components/brand/button";

export const metadata: Metadata = {
  title: "Not found — Forest Creek",
};

/** Inside the site's header and footer — reached when a property address doesn't exist. */
export default function SiteNotFound() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center px-5 py-28 text-center">
      <p className="text-xs font-medium tracking-[0.25em] text-accent uppercase">Not found</p>
      <h1 className="mt-4 font-display text-4xl leading-tight font-light sm:text-5xl">
        We couldn&rsquo;t find that place
      </h1>
      <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
        That address doesn&rsquo;t match any of our lodges. It may be mistyped, or the listing may
        no longer be open for bookings.
      </p>
      <div className="mt-10 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        {/* A hash target, so a plain anchor: typedRoutes has no notion of one. */}
        <a href="/#places" className={buttonClass({ shape: "pill", size: "lg" })}>
          See our places
        </a>
        <Link
          href="/book"
          className={buttonClass({ variant: "secondary", shape: "pill", size: "lg" })}
        >
          Book a stay
        </Link>
      </div>
    </section>
  );
}
