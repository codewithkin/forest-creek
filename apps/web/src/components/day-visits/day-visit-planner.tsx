"use client";

import { Input } from "@forest-creek/ui/components/input";
import { Label } from "@forest-creek/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Check, MapPin, Sun, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import RoomPhotos from "@/components/gallery/room-photos";
import { lodge, telHref } from "@/lib/lodge";
import { trpc } from "@/utils/trpc";

export type DayVisitSummary = {
  id: string;
  propertyId: string;
  name: string;
  description: string;
  /** Per person; null while the lodge has not announced it. */
  pricePerPerson: number | null;
  image: string;
  images: string[];
};

export type DayVisitProperty = {
  id: string;
  name: string;
  location: string;
  heroImage: string;
};

/** Today where the lodge is — a visitor abroad must not be offered yesterday. */
function lodgeToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function priceLabel(pricePerPerson: number | null): string {
  if (pricePerPerson === null) return "Price to be announced";
  if (pricePerPerson === 0) return "No charge";
  return `$${pricePerPerson} per person`;
}

function photosOf(visit: DayVisitSummary, property?: DayVisitProperty): string[] {
  if (visit.images.length > 0) return visit.images;
  if (visit.image) return [visit.image];
  return property?.heroImage ? [property.heroImage] : [];
}

type Requested = { reference: string; visitName: string; propertyName: string; visitDate: string; guests: number; pricePerPerson: number | null };

/**
 * The day visits on offer, and the request for one. Nothing is paid here: the
 * price may not be set yet, so staff confirm each visit and say how to pay.
 */
export default function DayVisitPlanner({
  visits,
  properties,
}: {
  visits: DayVisitSummary[];
  properties: DayVisitProperty[];
}) {
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const [selectedId, setSelectedId] = useState<string | undefined>(visits.length === 1 ? visits[0]!.id : undefined);
  const selected = visits.find((visit) => visit.id === selectedId);
  const formRef = useRef<HTMLDivElement>(null);

  const [visitDate, setVisitDate] = useState("");
  const [guests, setGuests] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Requested>();

  const request = useMutation(
    trpc.dayVisits.request.mutationOptions({
      onSuccess: (result) => {
        setDone(result);
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    }),
  );

  function choose(id: string) {
    setSelectedId(id);
    request.reset();
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    request.mutate({
      dayVisitId: selected.id,
      visitDate,
      guests: Number(guests) || 1,
      guestName,
      guestEmail,
      guestPhone,
      note: note.trim() || undefined,
    });
  }

  if (done) {
    const people = done.guests === 1 ? "1 guest" : `${done.guests} guests`;
    return (
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent/40">
          <Check className="h-6 w-6 text-accent" />
        </div>
        <h2 className="mt-6 font-display text-3xl font-light">Request received</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          We&rsquo;ve emailed you a copy. Our team will confirm your day visit by email — it isn&rsquo;t
          booked until they do.
        </p>
        <dl className="mt-8 rounded-2xl border border-border/70 bg-card p-6 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-display text-xl tracking-wider text-accent">{done.reference}</dd>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <dt className="text-muted-foreground">Day visit</dt>
            <dd className="text-right">
              {done.visitName} at {done.propertyName}
            </dd>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <dt className="text-muted-foreground">Date</dt>
            <dd className="text-right">{formatDay(done.visitDate)}</dd>
          </div>
          <div className="mt-3 flex justify-between gap-4">
            <dt className="text-muted-foreground">Guests</dt>
            <dd>{people}</dd>
          </div>
          <div className="mt-4 flex justify-between gap-4 border-t border-border/70 pt-4">
            <dt className="text-muted-foreground">Price</dt>
            <dd className="text-right">
              {done.pricePerPerson === null || done.pricePerPerson === 0
                ? priceLabel(done.pricePerPerson)
                : `$${done.pricePerPerson * done.guests} ($${done.pricePerPerson} × ${people})`}
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-xs text-muted-foreground">
          Nothing is paid online for a day visit. Questions? Call{" "}
          <a href={telHref(lodge.phone)} className="text-accent underline underline-offset-4">
            {lodge.phone}
          </a>
          .
        </p>
        <Link href="/" className={buttonClass({ variant: "secondary", shape: "pill", size: "lg", className: "mt-8" })}>
          Back to the lodge
        </Link>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-border/70 bg-card p-8 text-center">
        <Sun className="mx-auto h-8 w-8 text-accent" aria-hidden />
        <h2 className="mt-4 font-display text-2xl">Day visits are coming soon</h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          We&rsquo;re putting the details together. To plan a day with us in the meantime, call{" "}
          <a href={telHref(lodge.phone)} className="text-accent underline underline-offset-4">
            {lodge.phone}
          </a>{" "}
          or email{" "}
          <a href={`mailto:${lodge.email}`} className="text-accent underline underline-offset-4">
            {lodge.email}
          </a>
          .
        </p>
      </div>
    );
  }

  const estimate =
    selected && selected.pricePerPerson !== null && selected.pricePerPerson > 0 && Number(guests) > 0
      ? selected.pricePerPerson * Number(guests)
      : undefined;

  return (
    <div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {visits.map((visit) => {
          const property = propertyById.get(visit.propertyId);
          const photos = photosOf(visit, property);
          const isSelected = visit.id === selectedId;
          return (
            <article
              key={visit.id}
              className={`group flex h-full flex-col overflow-hidden rounded-3xl border bg-card transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/30 ${
                isSelected ? "border-accent" : "border-border/70 hover:border-accent/40"
              }`}
            >
              {photos.length > 0 ? (
                <RoomPhotos images={photos} name={visit.name} />
              ) : (
                <div className="aspect-[4/3] w-full bg-secondary" />
              )}
              <div className="flex flex-1 flex-col p-6">
                {property && (
                  <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-muted-foreground uppercase">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {property.name}
                  </p>
                )}
                <h3 className="mt-2 font-display text-2xl">{visit.name}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{visit.description}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <span
                    className={`font-display text-lg ${visit.pricePerPerson === null ? "text-muted-foreground italic" : "text-accent"}`}
                  >
                    {priceLabel(visit.pricePerPerson)}
                  </span>
                  <button
                    type="button"
                    onClick={() => choose(visit.id)}
                    aria-pressed={isSelected}
                    className={buttonClass({ shape: "pill", size: "sm", variant: isSelected ? "primary" : "secondary" })}
                  >
                    {isSelected ? "Selected" : "Plan this day"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div ref={formRef} className="scroll-mt-28">
        {selected && (
          <form onSubmit={submit} className="mx-auto mt-16 max-w-2xl rounded-3xl border border-border/70 bg-card p-6 sm:p-10">
            <span className="text-xs tracking-[0.2em] text-accent uppercase">Your day visit</span>
            <h2 className="mt-3 font-display text-3xl font-light">
              {selected.name}
              {propertyById.get(selected.propertyId) && (
                <span className="text-muted-foreground"> at {propertyById.get(selected.propertyId)!.name}</span>
              )}
            </h2>

            <fieldset disabled={request.isPending} className="mt-8 grid gap-5 sm:grid-cols-2">
              <div>
                <Label htmlFor="visitDate" className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Day
                </Label>
                <Input
                  id="visitDate"
                  type="date"
                  required
                  min={lodgeToday()}
                  value={visitDate}
                  onChange={(event) => setVisitDate(event.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="guests" className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" aria-hidden /> Guests
                </Label>
                <Input
                  id="guests"
                  type="number"
                  required
                  min={1}
                  max={100}
                  value={guests}
                  onChange={(event) => setGuests(event.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="dvName">Full name</Label>
                <Input id="dvName" required value={guestName} onChange={(event) => setGuestName(event.target.value)} className="mt-2" />
              </div>
              <div>
                <Label htmlFor="dvPhone">Phone</Label>
                <Input
                  id="dvPhone"
                  type="tel"
                  required
                  placeholder="07XX XXX XXX"
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                  className="mt-2"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="dvEmail">Email</Label>
                <Input
                  id="dvEmail"
                  type="email"
                  required
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  className="mt-2"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="dvNote">Anything we should know? (optional)</Label>
                <textarea
                  id="dvNote"
                  rows={3}
                  maxLength={1000}
                  placeholder="A birthday, dietary needs, when you plan to arrive…"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-2 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
                />
              </div>
            </fieldset>

            <div className="mt-8 rounded-2xl bg-secondary/50 px-5 py-4 text-sm">
              <p className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">Price</span>
                <span className="font-display text-lg">
                  {estimate !== undefined ? `$${estimate} for ${guests} ${Number(guests) === 1 ? "guest" : "guests"}` : priceLabel(selected.pricePerPerson)}
                </span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                This is a request: our team confirms every day visit by email
                {selected.pricePerPerson === null ? ", with the price," : ""} and tells you how to pay. Nothing is paid
                online.
              </p>
            </div>

            {request.isError && (
              <p className="mt-5 text-sm text-destructive" role="alert">
                {friendlyError(request.error)}
              </p>
            )}

            <button type="submit" className={buttonClass({ shape: "pill", size: "lg", className: "mt-8 w-full sm:w-auto" })}>
              {request.isPending && <Spinner />}
              Request this day visit
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
