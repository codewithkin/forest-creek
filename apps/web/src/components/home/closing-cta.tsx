import { ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";

import SplitWords from "@/components/motion/split-words";
import { reveal } from "@/components/motion/reveal";

/**
 * A near-black panel lit by a slowly drifting glow, like the light that comes
 * through the canopy late in the day. One headline, one clear action.
 */
export default function ClosingCta() {
  return (
    <section className="px-3 pb-3 sm:px-5">
      <div
        {...reveal("zoom")}
        className="relative isolate mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] bg-[hsl(168_60%_4%)] px-5 py-24 text-center sm:rounded-[2.5rem] sm:py-32"
      >
        <div className="pointer-events-none absolute -top-1/2 left-1/2 -z-10 h-[140%] w-[120%] -translate-x-1/2">
          <div className="h-full w-full animate-glow rounded-[50%] bg-[radial-gradient(ellipse_at_center,hsl(43_90%_71%/0.28),hsl(168_61%_20%/0.35)_40%,transparent_70%)] blur-2xl" />
        </div>
        <div className="hero-grid pointer-events-none absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />

        <span
          {...reveal("up", 100)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs tracking-[0.2em] text-accent uppercase"
        >
          The mist is waiting
        </span>
        <h2 className="mx-auto mt-6 max-w-3xl font-display text-4xl leading-[1.05] font-light sm:text-6xl md:text-7xl">
          <SplitWords text="Ready for a few quiet nights in the mountains?" delayMs={200} />
        </h2>
        <p
          {...reveal("up", 250)}
          className="mx-auto mt-6 max-w-lg leading-relaxed text-foreground/70"
        >
          Your room beneath the canopy is a few clicks away — or ask The Vumba Guide anything
          first.
        </p>

        <div
          {...reveal("up", 350)}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link
            href="/book"
            className="group relative inline-flex items-center gap-4 overflow-hidden rounded-full bg-foreground py-2 pr-2 pl-7 font-medium text-background shadow-2xl shadow-black/40 transition-transform duration-300 hover:-translate-y-0.5"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-accent/30 blur-md" />
            Reserve your stay
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-500 group-hover:-rotate-45">
              <ArrowRight className="size-4" />
            </span>
          </Link>
          <span className="inline-flex items-center gap-2 text-sm text-foreground/60">
            <MessageCircle className="size-4 text-accent" />
            Or tap “Ask the Guide” below
          </span>
        </div>
      </div>
    </section>
  );
}
