import { Leaf } from "lucide-react";
import Link from "next/link";

import { mediaUrl } from "@/lib/server-url";

export default function Hero() {
  return (
    <section className="relative isolate flex min-h-[88svh] items-center justify-center overflow-hidden">
      <img
        src={mediaUrl("/media/canopy-pool.webp")}
        alt="The lodge pool looking out over the misty Vumba mountains"
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/80 via-background/65 to-background" />

      <div className="mx-auto max-w-3xl px-5 py-24 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-background/40 px-4 py-1.5 text-xs tracking-[0.2em] text-accent uppercase backdrop-blur-sm">
          <Leaf className="h-3.5 w-3.5" />
          Eco-Conscious Retreat
        </span>

        <h1 className="mt-8 font-display text-5xl leading-[1.05] font-light sm:text-6xl md:text-7xl">
          Where Nature
          <br />
          Meets Luxury
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          An eco-conscious retreat in the Vumba highlands — every stay planted lightly among the
          trees.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/book"
            className="w-full rounded-full bg-accent px-8 py-3.5 font-medium text-accent-foreground transition-opacity hover:opacity-90 sm:w-auto"
          >
            Reserve your stay
          </Link>
          <a
            href="/places"
            className="w-full rounded-full border border-border px-8 py-3.5 text-center transition-colors hover:border-accent/50 hover:text-accent sm:w-auto"
          >
            Explore our places
          </a>
        </div>
      </div>
    </section>
  );
}
