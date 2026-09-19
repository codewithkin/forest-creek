import type { Metadata } from "next";
import { ArrowRight, BedDouble, Check, ChevronRight, Mail, MapPin, Phone, Users } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActivityCard from "@/components/activity-card";
import PropertyGallery from "@/components/gallery/property-gallery";
import SplitWords from "@/components/motion/split-words";
import { reveal, stagger } from "@/components/motion/reveal";
import RoomCard from "@/components/room-card";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/server-url";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ property: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { property: slug } = await params;
  const property = await api.properties.bySlug.query(slug);
  if (!property) return { title: "Not found — Forest Creek" };
  return { title: `${property.name} — ${property.tagline}`, description: property.description };
}

export default async function PropertyPage({ params }: Params) {
  const { property: slug } = await params;
  const property = await api.properties.bySlug.query(slug);
  if (!property) notFound();

  const photos = [...new Set([property.heroImage, ...property.gallery].filter(Boolean))];

  const [rooms, activities] = await Promise.all([
    api.rooms.list.query({ propertyId: property.id }),
    api.activities.list.query({ propertyId: property.id }),
  ]);

  const prices = rooms.map((room) => room.pricePerNight);
  const fromPrice = prices.length ? Math.min(...prices) : null;
  const sleeps = rooms.reduce((max, room) => Math.max(max, room.capacity), 0);
  const bookHref = `/book?property=${property.slug}` as Route;

  return (
    <>
      {/* Framed hero */}
      <section className="px-3 pt-3 sm:px-5">
        <div className="relative isolate mx-auto flex min-h-[78svh] max-w-[88rem] items-end overflow-hidden rounded-[2rem] border border-border/60 sm:rounded-[2.5rem]">
          <img
            src={mediaUrl(property.heroImage)}
            alt={property.name}
            className="absolute inset-0 -z-20 h-full w-full animate-ken-burns object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/55 to-background/20" />

          <div className="w-full px-5 pt-32 pb-10 sm:px-10 sm:pb-14">
            <nav
              aria-label="Breadcrumb"
              className="flex animate-fade-in items-center gap-1.5 text-xs text-foreground/70"
            >
              <Link href="/" className="hover:text-accent">
                Home
              </Link>
              <ChevronRight className="size-3" />
              <Link href="/places" className="hover:text-accent">
                Places
              </Link>
              <ChevronRight className="size-3" />
              <span className="text-foreground">{property.name}</span>
            </nav>

            <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="inline-flex animate-blur-in items-center gap-1.5 rounded-full border border-white/20 bg-background/40 px-3 py-1 text-xs tracking-[0.15em] text-accent uppercase backdrop-blur-md">
                  <MapPin className="size-3.5" />
                  {property.location}
                </p>
                <h1 className="mt-5 font-display text-5xl leading-[1.02] font-light sm:text-7xl">
                  <SplitWords text={property.name} delayMs={100} />
                </h1>
                <p
                  className="mt-4 animate-fade-up font-display text-2xl text-foreground/80 italic sm:text-3xl"
                  style={{ animationDelay: "450ms" }}
                >
                  {property.tagline}
                </p>
              </div>

              <div
                className="flex animate-fade-up flex-wrap items-center gap-3"
                style={{ animationDelay: "600ms" }}
              >
                {fromPrice !== null && (
                  <div className="rounded-2xl border border-white/15 bg-background/60 px-5 py-3 backdrop-blur-xl">
                    <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                      Rooms from
                    </p>
                    <p className="font-display text-3xl text-accent">
                      ${fromPrice}
                      <span className="ml-1 font-sans text-xs text-muted-foreground">/ night</span>
                    </p>
                  </div>
                )}
                <Link
                  href={bookHref}
                  className="group inline-flex items-center gap-4 rounded-full bg-accent py-2 pr-2 pl-6 font-medium text-accent-foreground shadow-2xl shadow-accent/25 transition-transform duration-300 hover:-translate-y-0.5"
                >
                  Reserve your stay
                  <span className="flex size-10 items-center justify-center rounded-full bg-accent-foreground text-accent transition-transform duration-500 group-hover:-rotate-45">
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery + booking card, product-page style */}
      <section id="gallery" className="scroll-mt-24 py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-12">
          <div {...reveal("up")} className="lg:col-span-8">
            <PropertyGallery images={photos} name={property.name} />
          </div>

          <aside className="lg:col-span-4">
            <div
              {...reveal("left", 150)}
              className="rounded-3xl border border-border/70 bg-card p-6 lg:sticky lg:top-28"
            >
              <span className="inline-flex rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">
                {rooms.length} {rooms.length === 1 ? "room" : "rooms"} available to book
              </span>
              <h2 className="mt-4 font-display text-3xl">{property.name}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {property.description}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl border border-border/60 p-3">
                  <BedDouble className="size-4 text-accent" />
                  <p className="mt-2 text-muted-foreground">From</p>
                  <p className="font-display text-xl">
                    {fromPrice !== null ? `$${fromPrice}` : "On request"}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/60 p-3">
                  <Users className="size-4 text-accent" />
                  <p className="mt-2 text-muted-foreground">Sleeps up to</p>
                  <p className="font-display text-xl">{sleeps > 0 ? sleeps : "—"}</p>
                </div>
              </div>

              {property.amenities.length > 0 && (
                <ul className="mt-6 space-y-2 text-sm">
                  {property.amenities.slice(0, 6).map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="size-4 shrink-0 text-accent" />
                      {amenity}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex gap-2">
                <Link
                  href={bookHref}
                  className="flex-1 rounded-full bg-accent py-3 text-center text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
                >
                  Book now
                </Link>
                <a
                  href="#rooms"
                  className="rounded-full border border-border px-5 py-3 text-sm transition-colors hover:border-accent/60 hover:text-accent"
                >
                  See rooms
                </a>
              </div>

              <div className="mt-6 space-y-2 border-t border-border/60 pt-5 text-xs text-muted-foreground">
                <a
                  href={`tel:${property.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 hover:text-accent"
                >
                  <Phone className="size-3.5" />
                  {property.phone}
                </a>
                <a href={`mailto:${property.email}`} className="flex items-center gap-2 break-all hover:text-accent">
                  <Mail className="size-3.5 shrink-0" />
                  {property.email}
                </a>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section id="rooms" className="scroll-mt-24 bg-popover/50 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <span {...reveal("up")} className="text-xs tracking-[0.2em] text-accent uppercase">
                Rooms
              </span>
              <h2
                {...reveal("up", 80)}
                className="mt-4 font-display text-4xl font-light sm:text-6xl"
              >
                Rest beneath <em className="text-accent">the canopy</em>
              </h2>
            </div>
            <p {...reveal("left", 150)} className="max-w-xs text-sm text-muted-foreground">
              Swipe through each room&rsquo;s photos, or tap one to see it full screen.
            </p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room, index) => (
              <div key={room.id} {...reveal("up", stagger(index, 120))} className="flex">
                <RoomCard room={room} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {activities.length > 0 && (
        <section id="activities" className="scroll-mt-24 py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid gap-12 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <div className="lg:sticky lg:top-28">
                  <span {...reveal("up")} className="text-xs tracking-[0.2em] text-accent uppercase">
                    Activities
                  </span>
                  <h2
                    {...reveal("up", 80)}
                    className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-5xl"
                  >
                    Days shaped by the mountain
                  </h2>
                  <p {...reveal("up", 160)} className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    Add any of these while you book — or ask The Vumba Guide what suits your
                    group.
                  </p>
                </div>
              </div>
              <div className="grid gap-6 sm:grid-cols-2 lg:col-span-8">
                {activities.map((activity, index) => (
                  <div
                    key={activity.id}
                    {...reveal(index % 2 === 0 ? "up" : "zoom", stagger(index, 110))}
                    className={index % 2 === 1 ? "sm:mt-12" : ""}
                  >
                    <ActivityCard activity={activity} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Property CTA: a split card rather than the landing page's glow panel */}
      <section className="px-3 pb-3 sm:px-5">
        <div
          {...reveal("zoom")}
          className="mx-auto grid max-w-[88rem] overflow-hidden rounded-[2rem] border border-border/60 bg-card sm:rounded-[2.5rem] md:grid-cols-2"
        >
          <div className="flex flex-col justify-center p-8 sm:p-14">
            <span className="text-xs tracking-[0.2em] text-accent uppercase">Your stay</span>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] font-light sm:text-5xl">
              Wake up at {property.name}
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Pick your dates and room — you&rsquo;ll see the full price before you pay by
              EcoCash or OneMoney.
            </p>
            <Link
              href={bookHref}
              className="group mt-8 inline-flex items-center gap-4 self-start rounded-full bg-foreground py-2 pr-2 pl-6 font-medium text-background transition-transform duration-300 hover:-translate-y-0.5"
            >
              Check availability
              <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform duration-500 group-hover:-rotate-45">
                <ArrowRight className="size-4" />
              </span>
            </Link>
          </div>
          <div className="relative min-h-72 overflow-hidden">
            <img
              src={mediaUrl(photos[1] ?? property.heroImage)}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full animate-ken-burns object-cover"
            />
          </div>
        </div>
      </section>
    </>
  );
}
