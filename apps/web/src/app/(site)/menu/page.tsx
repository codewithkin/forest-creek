import { Coffee, Download, UtensilsCrossed, Wine } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { mediaUrl } from "@/lib/server-url";
import SplitWords from "@/components/motion/split-words";
import { reveal, stagger } from "@/components/motion/reveal";
import { api } from "@/lib/api";
import { lodge, telHref } from "@/lib/lodge";
import { formatMenuPrice } from "@/lib/menu-format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu — Forest Creek",
  description: "Breakfast, meals and the bar at Forest Creek — what's on the menu, with prices.",
};

type Props = { searchParams: Promise<{ property?: string }> };

export default async function MenuPage({ searchParams }: Props) {
  const { property: slug } = await searchParams;
  const menus = await api.menu.public.query();
  const menu = menus.find((candidate) => candidate.property.slug === slug) ?? menus[0];
  const food = menu?.sections.filter((section) => section.kind === "food") ?? [];
  const bar = menu?.sections.filter((section) => section.kind === "bar") ?? [];

  return (
    <>
      <section className="px-3 pt-3 sm:px-5">
        <div className="relative isolate mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] border border-border/60 sm:rounded-[2.5rem]">
          <img src="/images/know-us.jpeg" alt="" className="absolute inset-0 -z-20 h-full w-full animate-ken-burns object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/85 to-background/30" />
          <div className="max-w-2xl px-6 py-16 sm:px-12 sm:py-24">
            <span className="inline-flex animate-blur-in rounded-full border border-white/20 bg-background/40 px-3 py-1 text-xs tracking-[0.2em] text-accent uppercase backdrop-blur-md">
              Menu
            </span>
            <h1 className="mt-5 font-display text-5xl leading-[1.02] font-light sm:text-6xl">
              <SplitWords text="From the" delayMs={100} />{" "}
              <em className="text-accent">
                <SplitWords text="kitchen & bar" delayMs={100} startIndex={2} />
              </em>
            </h1>
            <p className="mt-5 max-w-md animate-fade-up text-foreground/75" style={{ animationDelay: "400ms" }}>
              Breakfast to a nightcap — everything we serve, with prices in US dollars.
            </p>
            {menu && (
              <div className="mt-7 flex animate-fade-up flex-wrap gap-2" style={{ animationDelay: "550ms" }}>
                {food.length > 0 && (
                  <a href="#food" className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground">
                    <UtensilsCrossed className="size-4" /> Food
                  </a>
                )}
                {bar.length > 0 && (
                  <a href="#bar" className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-background/40 px-5 py-2.5 text-sm backdrop-blur-md">
                    <Wine className="size-4" /> Bar
                  </a>
                )}
                <a
                  href={`/menu/pdf?property=${encodeURIComponent(menu.property.slug)}`}
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-background/40 px-5 py-2.5 text-sm backdrop-blur-md"
                >
                  <Download className="size-4" /> Download
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-16">
        {!menu && (
          <div {...reveal("up")} className="mx-auto max-w-xl rounded-3xl border border-border/70 bg-card p-8 text-center">
            <UtensilsCrossed className="mx-auto size-8 text-accent" />
            <h2 className="mt-4 font-display text-2xl">Our menu is on its way</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              We&rsquo;re putting it together. To ask what&rsquo;s cooking, call{" "}
              <a href={telHref(lodge.phone)} className="text-accent underline underline-offset-4">{lodge.phone}</a>.
            </p>
          </div>
        )}

        {menu && menus.length > 1 && (
          <nav {...reveal("up")} aria-label="Choose a property" className="mb-12 flex flex-wrap gap-2">
            {menus.map((candidate) => (
              <Link
                key={candidate.property.id}
                href={`/menu?property=${candidate.property.slug}` as Route}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  candidate.property.id === menu.property.id ? "bg-accent text-accent-foreground" : "border border-border hover:border-accent/50"
                }`}
              >
                {candidate.property.name}
              </Link>
            ))}
          </nav>
        )}

        {menu?.property.breakfastIncluded && (
          <p {...reveal("up")} className="mb-12 flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-5 py-4 text-sm">
            <Coffee className="size-5 shrink-0 text-accent" />
            Breakfast is included with every night&rsquo;s stay at {menu.property.name}.
          </p>
        )}

        {menu && (
          <div className="space-y-20">
            {[
              { id: "food", title: "Food", icon: UtensilsCrossed, sections: food },
              { id: "bar", title: "Bar", icon: Wine, sections: bar },
            ]
              .filter((part) => part.sections.length > 0)
              .map((part) => (
                <section key={part.id} id={part.id} className="scroll-mt-28">
                  <h2 {...reveal("up")} className="flex items-center gap-3 font-display text-4xl font-light sm:text-5xl">
                    <part.icon className="size-7 text-accent" />
                    {part.title}
                  </h2>
                  <div className="mt-10 grid gap-x-14 gap-y-12 md:grid-cols-2">
                    {part.sections.map((section, index) => (
                      <div key={section.id} {...reveal("up", stagger(index, 90))}>
                        <h3 className="font-display text-2xl text-accent">{section.name}</h3>
                        {section.note && <p className="mt-1 text-xs tracking-wide text-muted-foreground uppercase">{section.note}</p>}
                        <ul className="mt-5 space-y-5">
                          {section.items.map((item) => (
                            <li key={item.id} className={`flex gap-4 ${item.available ? "" : "opacity-50"}`}>
                              {item.image && (
                                <img src={mediaUrl(item.image)} alt="" loading="lazy" className="size-16 shrink-0 rounded-2xl object-cover" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-3">
                                  <span className="font-medium">{item.name}</span>
                                  <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-border" />
                                  <span className="font-display text-lg tabular-nums">{formatMenuPrice(item.priceCents)}</span>
                                </div>
                                {item.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>}
                                {(item.tags.length > 0 || !item.available) && (
                                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                                    {!item.available && (
                                      <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-rose-300">Sold out today</span>
                                    )}
                                    {item.tags.map((tag) => (
                                      <span key={tag} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{tag}</span>
                                    ))}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            <p {...reveal("up")} className="text-center text-xs text-muted-foreground">
              Prices in US dollars. &ldquo;Ask&rdquo; means our team will tell you today&rsquo;s price. Tell us about any allergies when you order.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
