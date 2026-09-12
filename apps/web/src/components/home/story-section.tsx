import { Leaf, Mountain, Sparkles } from "lucide-react";

import { mediaUrl } from "@/lib/server-url";

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

export default function StorySection() {
  return (
    <section id="story" className="scroll-mt-20 border-t border-border/60 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-border/70">
          <img
            src={mediaUrl("/media/lodge-bar.webp")}
            alt="The lodge bar, lit warm against the forest outside"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>

        <div>
          <span className="text-xs tracking-[0.2em] text-accent uppercase">Our Story</span>
          <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">
            A small house in a large forest
          </h2>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            Forest Creek sits in the Vumba highlands above Mutare, where the cloud comes down
            through the trees most afternoons and the evenings smell of woodsmoke. It was made for
            people who want the mountain close by and very little else between them and it.
          </p>

          <ul className="mt-10 space-y-6">
            {marks.map((mark) => (
              <li key={mark.title} className="flex gap-4">
                <mark.icon className="mt-1 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h3 className="font-display text-xl">{mark.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{mark.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
