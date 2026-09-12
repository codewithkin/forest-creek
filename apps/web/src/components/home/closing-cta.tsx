import Link from "next/link";

import { mediaUrl } from "@/lib/server-url";

export default function ClosingCta() {
  return (
    <section className="relative isolate overflow-hidden border-t border-border/60">
      <img
        src={mediaUrl("/media/forest-walk.webp")}
        alt=""
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-background/80" />

      <div className="mx-auto max-w-2xl px-5 py-28 text-center">
        <h2 className="font-display text-4xl font-light sm:text-5xl">The mist is waiting.</h2>
        <p className="mt-5 leading-relaxed text-muted-foreground">
          Your room beneath the canopy is only a few clicks away.
        </p>
        <Link
          href="/book"
          className="mt-10 inline-block rounded-full bg-accent px-8 py-3.5 font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Reserve your stay
        </Link>
      </div>
    </section>
  );
}
