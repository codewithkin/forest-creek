import { ArrowRight, Leaf, Mountain, Sparkles } from "lucide-react";
import Link from "next/link";

import { reveal, stagger } from "@/components/motion/reveal";
import Photo from "@/components/media/photo";

const marks = [
  {
    icon: Leaf,
    title: "Planted lightly",
    body: "Built into the treeline rather than over it, with the forest left to close back in around us.",
  },
  {
    icon: Mountain,
    title: "Of the Vumba",
    body: "Mist, msasa and mountain air — the range does most of the work, we simply set a table in it.",
  },
  {
    icon: Sparkles,
    title: "Kept by hand",
    body: "A small house looked after by Thembie and Michaels, who you will almost certainly meet.",
  },
];

/**
 * "Know us": the brand photograph shown whole as a wide banner, then a split
 * with a sticky headline and inset photo on one side and the three things we
 * stand for, numbered, on the other.
 */
export default function StorySection() {
  return (
    <section id="story" className="scroll-mt-24 bg-popover/50 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <div
          {...reveal("curtain")}
          className="group relative overflow-hidden rounded-[2rem] border border-border/60"
        >
          <Photo
            src="/images/know-us.jpeg"
            alt="Know us — a Forest Creek bedroom opening onto the garden and the mountain"
            className="aspect-[16/10] w-full object-cover object-left transition-transform duration-[2000ms] ease-[var(--ease-soft)] group-hover:scale-[1.04] sm:aspect-[16/9]"
          />
          <div
            {...reveal("up", 400)}
            className="absolute right-3 bottom-3 max-w-[16rem] rounded-2xl border border-white/20 bg-background/70 p-4 backdrop-blur-xl sm:right-6 sm:bottom-6 sm:p-5"
          >
            <p className="text-[10px] tracking-[0.18em] text-accent uppercase">Your hosts</p>
            <p className="mt-1 font-display text-lg leading-snug sm:text-xl">Thembie &amp; Michaels</p>
            <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
              Managing every stay with care, in person.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-28">
              <span {...reveal("up")} className="text-xs tracking-[0.2em] text-accent uppercase">
                Our story
              </span>
              <h2
                {...reveal("up", 80)}
                className="mt-4 font-display text-4xl leading-[1.02] font-light tracking-tight uppercase sm:text-6xl"
              >
                A small house in a large forest
              </h2>

              {/*
                Stacked on a phone. Side by side it left the paragraph about
                twenty characters wide, which is what the team flagged.
              */}
              <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-5">
                <div
                  {...reveal("zoom", 160)}
                  className="overflow-hidden rounded-2xl border border-border/60 sm:w-40 sm:shrink-0"
                >
                  <Photo
                    src="/media/lodge-bar.webp"
                    alt="The lodge bar, lit warm against the forest outside"
                    className="aspect-[16/10] w-full animate-float-slow object-cover sm:aspect-[3/4]"
                  />
                </div>
                <div {...reveal("up", 240)} className="sm:min-w-0">
                  <p className="text-base leading-relaxed text-muted-foreground sm:text-sm">
                    Made for people who want the mountain close by, and very little between them
                    and it.
                  </p>
                  <Link
                    href="/places"
                    className="group mt-5 inline-flex items-center gap-3 rounded-full bg-foreground py-1.5 pr-1.5 pl-5 text-sm font-medium text-background transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    Find your place
                    <span className="flex size-8 items-center justify-center rounded-full bg-background text-foreground transition-transform duration-500 group-hover:-rotate-45">
                      <ArrowRight className="size-4" />
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            <p
              {...reveal("up", 120)}
              className="font-display text-2xl leading-relaxed text-foreground/90 sm:text-3xl"
            >
              Forest Creek sits in the Vumba highlands above Mutare, where the cloud comes down
              through the trees most afternoons and the evenings smell of woodsmoke.
            </p>

            <ol className="mt-12 divide-y divide-border/60 border-y border-border/60">
              {marks.map((mark, index) => (
                <li
                  key={mark.title}
                  {...reveal("up", stagger(index, 120))}
                  className="group grid grid-cols-[auto_1fr] gap-5 py-7 sm:grid-cols-[4rem_auto_1fr] sm:items-start"
                >
                  <span className="hidden font-display text-3xl text-accent/40 italic sm:block">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-accent transition-all duration-500 group-hover:rotate-12 group-hover:bg-accent group-hover:text-accent-foreground">
                    <mark.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl">{mark.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {mark.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
