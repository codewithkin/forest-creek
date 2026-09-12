import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ActivityCard from "@/components/activity-card";
import RoomCard from "@/components/room-card";
import { api } from "@/lib/api";
import { mediaUrl } from "@/lib/server-url";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ property: string }> };

function resolve(image: string): string {
  return image.startsWith("http") ? image : mediaUrl(image);
}

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

  const [rooms, activities] = await Promise.all([
    api.rooms.list.query({ propertyId: property.id }),
    api.activities.list.query({ propertyId: property.id }),
  ]);

  return (
    <>
      <section className="relative isolate flex min-h-[70svh] items-center justify-center overflow-hidden">
        <img
          src={resolve(property.heroImage)}
          alt={property.name}
          className="absolute inset-0 -z-20 h-full w-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background/80 via-background/65 to-background" />

        <div className="mx-auto max-w-3xl px-5 py-24 text-center">
          <p className="inline-flex items-center gap-1.5 text-xs tracking-[0.2em] text-accent uppercase">
            <MapPin className="h-3.5 w-3.5" />
            {property.location}
          </p>
          <h1 className="mt-6 font-display text-5xl leading-[1.05] font-light sm:text-6xl">
            {property.name}
          </h1>
          <p className="mt-5 font-display text-2xl text-muted-foreground">{property.tagline}</p>
          <p className="mx-auto mt-6 max-w-xl leading-relaxed text-muted-foreground">
            {property.description}
          </p>
          <Link
            href={`/book?property=${property.slug}` as Route}
            className="mt-10 inline-block rounded-full bg-accent px-8 py-3.5 font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Reserve your stay
          </Link>
        </div>
      </section>

      {property.amenities.length > 0 && (
        <section className="border-t border-border/60 py-12">
          <ul className="mx-auto flex max-w-6xl flex-wrap justify-center gap-3 px-5">
            {property.amenities.map((amenity) => (
              <li
                key={amenity}
                className="rounded-full border border-border/70 px-4 py-1.5 text-sm text-muted-foreground"
              >
                {amenity}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="rooms" className="scroll-mt-20 border-t border-border/60 py-24">
        <div className="mx-auto max-w-6xl px-5">
          <span className="text-xs tracking-[0.2em] text-accent uppercase">Rooms</span>
          <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">Rest beneath the canopy</h2>
          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        </div>
      </section>

      {activities.length > 0 && (
        <section id="activities" className="scroll-mt-20 border-t border-border/60 bg-popover py-24">
          <div className="mx-auto max-w-6xl px-5">
            <span className="text-xs tracking-[0.2em] text-accent uppercase">Activities</span>
            <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">
              Days shaped by the mountain
            </h2>
            <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </div>
        </section>
      )}

      {property.gallery.length > 0 && (
        <section id="gallery" className="scroll-mt-20 border-t border-border/60 py-24">
          <div className="mx-auto max-w-6xl px-5">
            <span className="text-xs tracking-[0.2em] text-accent uppercase">Gallery</span>
            <h2 className="mt-4 font-display text-4xl font-light sm:text-5xl">The lodge, in light</h2>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {property.gallery.map((image) => (
                <div key={image} className="overflow-hidden rounded-2xl border border-border/70">
                  <img src={resolve(image)} alt="" className="aspect-[4/5] w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
