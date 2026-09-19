import { ArrowRight, Check, Leaf, MessageCircle, Mountain, Star } from "lucide-react";
import Link from "next/link";

import SplitWords from "@/components/motion/split-words";
import { api } from "@/lib/api";

const promises = ["Mountain views", "Garden braai", "Hosted in person"];

/**
 * A framed hero: the photograph sits inside a rounded panel with a faint
 * drafting grid and hatched side rails, the headline rises word by word, and
 * glass cards drift over the scene with real figures from the API.
 */
export default async function Hero() {
  const [facets, properties] = await Promise.all([
    api.properties.facets.query(),
    api.properties.list.query(),
  ]);

  return (
    <section className="px-3 pt-3 sm:px-5">
      <div className="relative isolate mx-auto flex min-h-[calc(100svh-6rem)] max-w-[88rem] flex-col overflow-hidden rounded-[2rem] border border-border/60 sm:rounded-[2.5rem]">
        <img
          src="/images/view.jpeg"
          alt="The lodge garden and braai stand beneath the Vumba mountains"
          className="absolute inset-0 -z-30 h-full w-full animate-ken-burns object-cover"
        />
        <div className="absolute inset-0 -z-20 bg-gradient-to-b from-background/75 via-background/45 to-background/95" />
        <div className="hero-grid pointer-events-none absolute inset-0 -z-10 hidden animate-fade-in lg:block" />
        <div className="hatch pointer-events-none absolute inset-y-0 left-0 -z-10 hidden w-[8%] animate-fade-in border-r border-white/10 lg:block" />
        <div className="hatch pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[8%] animate-fade-in border-l border-white/10 lg:block" />

        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-5 pt-20 pb-40 text-center sm:pb-48">
          <span className="inline-flex animate-blur-in items-center gap-2 rounded-full border border-white/20 bg-background/40 px-4 py-1.5 text-xs tracking-[0.2em] text-accent uppercase backdrop-blur-md">
            <Leaf className="size-3.5" />
            Eco-conscious retreat · Vumba
          </span>

          <h1 className="mt-8 font-display text-5xl leading-[1.02] font-light sm:text-7xl md:text-8xl">
            <span className="block">
              <SplitWords text="Where nature" delayMs={150} />
            </span>
            <span className="block text-accent italic">
              <SplitWords text="meets luxury" delayMs={150} startIndex={2} />
            </span>
          </h1>

          <p
            className="mx-auto mt-7 max-w-xl animate-fade-up text-base leading-relaxed text-foreground/80 sm:text-lg"
            style={{ animationDelay: "550ms" }}
          >
            A garden, a braai fire and the mountain at the end of the lawn — every stay planted
            lightly among the trees of the Vumba highlands.
          </p>

          <div
            className="mt-10 flex w-full animate-fade-up flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row"
            style={{ animationDelay: "700ms" }}
          >
            <Link
              href="/book"
              className="group relative inline-flex w-full items-center justify-between gap-4 overflow-hidden rounded-full bg-accent py-2 pr-2 pl-7 font-medium text-accent-foreground shadow-2xl shadow-accent/25 transition-transform duration-300 hover:-translate-y-0.5 sm:w-auto"
            >
              <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/30 blur-md" />
              Reserve your stay
              <span className="flex size-10 items-center justify-center rounded-full bg-accent-foreground text-accent transition-transform duration-500 group-hover:-rotate-45">
                <ArrowRight className="size-4" />
              </span>
            </Link>
            <Link
              href="/places"
              className="inline-flex w-full items-center justify-center rounded-full border border-white/25 bg-background/30 px-7 py-4 text-sm backdrop-blur-md transition-colors hover:border-accent/60 hover:text-accent sm:w-auto"
            >
              Explore our places
            </Link>
          </div>

          <ul
            className="mt-8 flex animate-fade-in flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-foreground/70"
            style={{ animationDelay: "900ms" }}
          >
            {promises.map((promise) => (
              <li key={promise} className="inline-flex items-center gap-1.5">
                <Check className="size-3.5 text-accent" />
                {promise}
              </li>
            ))}
          </ul>
        </div>

        {/* Glass cards drifting over the scene */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-8">
          {facets.minPrice > 0 && (
            <div
              className="animate-fade-up rounded-2xl border border-white/15 bg-background/60 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5"
              style={{ animationDelay: "1000ms" }}
            >
              <div className="animate-float">
                <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  Rooms from
                </p>
                <p className="mt-1 font-display text-3xl text-accent sm:text-4xl">
                  ${facets.minPrice}
                  <span className="ml-1 font-sans text-xs text-muted-foreground">/ night</span>
                </p>
              </div>
            </div>
          )}

          <div
            className="hidden animate-fade-up rounded-2xl border border-white/15 bg-background/60 px-5 py-4 shadow-2xl shadow-black/30 backdrop-blur-xl md:block"
            style={{ animationDelay: "1150ms" }}
          >
            <div className="flex animate-float-slow items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Mountain className="size-5" />
              </span>
              <div className="text-left">
                <p className="text-sm font-medium">
                  {properties.length} {properties.length === 1 ? "house" : "houses"} in the highlands
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3 fill-accent text-accent" />
                  Each with its own character
                </p>
              </div>
            </div>
          </div>

          <div
            className="animate-fade-up rounded-2xl border border-white/15 bg-background/60 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-5"
            style={{ animationDelay: "1300ms" }}
          >
            <div className="flex animate-float items-center gap-3" style={{ animationDelay: "1.5s" }}>
              <span className="relative flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <MessageCircle className="size-4" />
                <span className="absolute -top-0.5 -right-0.5 size-2.5 animate-ping rounded-full bg-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400" />
              </span>
              <div className="text-left">
                <p className="text-sm font-medium">The Vumba Guide</p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Ask anything, day or night
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
