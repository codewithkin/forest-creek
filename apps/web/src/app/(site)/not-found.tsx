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
      <p className="font-display text-8xl leading-none text-accent/30 italic animate-blur-in sm:text-9xl">404</p>
      <p className="mt-6 animate-fade-up text-xs font-medium tracking-[0.25em] text-accent uppercase">Not found</p>
      <h1 className="mt-4 animate-fade-up font-display text-4xl leading-tight font-light sm:text-5xl">
        We couldn&rsquo;t find that place
      </h1>
      <p style={{ animationDelay: "150ms" }} className="mt-5 max-w-md animate-fade-up leading-relaxed text-muted-foreground">
        That address doesn&rsquo;t match any of our lodges. It may be mistyped, or the listing may
        no longer be open for bookings.
      </p>
      <div style={{ animationDelay: "300ms" }} className="mt-10 flex w-full animate-fade-up flex-col gap-3 sm:w-auto sm:flex-row">
        <Link href="/places" className={buttonClass({ shape: "pill", size: "lg" })}>
          See our places
        </Link>
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
