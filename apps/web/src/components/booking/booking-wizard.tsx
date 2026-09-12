"use client";

import { Input } from "@forest-creek/ui/components/input";
import { Label } from "@forest-creek/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BedDouble, Check, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { mediaUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

import BookingSummary from "./booking-summary";
import type { BookableActivity, BookableRoom, PaymentMethodValue } from "./types";
import { countNights, paymentMethods, todayIso } from "./types";

const steps = ["Your Room", "Dates & Guests", "Experiences", "Details & Payment"];

type Props = {
  rooms: BookableRoom[];
  activities: BookableActivity[];
};

export default function BookingWizard({ rooms, activities }: Props) {
  const [step, setStep] = useState(0);
  const [roomId, setRoomId] = useState<string>();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("card");

  const room = rooms.find((candidate) => candidate.id === roomId);
  const nights = countNights(checkIn, checkOut);
  const chosenActivities = activities.filter((activity) => activityIds.includes(activity.id));
  const today = todayIso();

  const availability = useQuery({
    ...trpc.rooms.available.queryOptions({ checkIn, checkOut }),
    enabled: nights > 0,
  });

  const isRoomFree =
    availability.data === undefined
      ? undefined
      : availability.data.some((candidate) => candidate.id === roomId);

  const createBooking = useMutation(trpc.bookings.create.mutationOptions());

  if (createBooking.data) {
    return <Confirmation booking={createBooking.data} />;
  }

  const overCapacity = room !== undefined && guests > room.capacity;
  const canLeaveDates = nights > 0 && !overCapacity && isRoomFree === true;

  const canContinue = [roomId !== undefined, canLeaveDates, true, false][step] ?? false;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
      <div>
        <ol className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border/60 pb-5">
          {steps.map((label, index) => (
            <li
              key={label}
              className={`flex items-center gap-2 text-sm ${
                index === step
                  ? "text-accent"
                  : index < step
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                  index === step
                    ? "border-accent text-accent"
                    : index < step
                      ? "border-border bg-border/40"
                      : "border-border/50"
                }`}
              >
                {index < step ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div className="py-10">
          {step === 0 && (
            <fieldset>
              <legend className="font-display text-2xl">Choose your room</legend>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {rooms.map((candidate) => (
                  <label
                    key={candidate.id}
                    className={`cursor-pointer overflow-hidden rounded-2xl border text-left transition-colors ${
                      roomId === candidate.id
                        ? "border-accent"
                        : "border-border/70 hover:border-accent/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="room"
                      value={candidate.id}
                      checked={roomId === candidate.id}
                      onChange={() => {
                        setRoomId(candidate.id);
                        setGuests(Math.min(guests, candidate.capacity));
                      }}
                      className="sr-only"
                    />
                    <img
                      src={mediaUrl(candidate.image)}
                      alt={candidate.name}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <div className="p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-display text-xl">{candidate.name}</h3>
                        <span className="font-display text-xl text-accent">
                          ${candidate.pricePerNight}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-accent" /> Sleeps {candidate.capacity}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <BedDouble className="h-3.5 w-3.5 text-accent" /> {candidate.bedType}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 1 && room && (
            <fieldset>
              <legend className="font-display text-2xl">When are you coming?</legend>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div>
                  <Label htmlFor="checkIn">Check-in</Label>
                  <Input
                    id="checkIn"
                    type="date"
                    min={today}
                    value={checkIn}
                    onChange={(event) => setCheckIn(event.target.value)}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="checkOut">Check-out</Label>
                  <Input
                    id="checkOut"
                    type="date"
                    min={checkIn || today}
                    value={checkOut}
                    onChange={(event) => setCheckOut(event.target.value)}
                    className="mt-2"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="guests">Guests (this room sleeps {room.capacity})</Label>
                  <Input
                    id="guests"
                    type="number"
                    min={1}
                    max={room.capacity}
                    value={guests}
                    onChange={(event) => setGuests(Number(event.target.value))}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="mt-5 text-sm" aria-live="polite">
                {overCapacity && (
                  <p className="text-destructive">
                    {room.name} sleeps {room.capacity}. Reduce the party or pick another room.
                  </p>
                )}
                {nights > 0 && availability.isPending && (
                  <p className="text-muted-foreground">Checking those nights…</p>
                )}
                {nights > 0 && isRoomFree === false && (
                  <p className="text-destructive">
                    {room.name} is taken for those dates. Try different nights or another room.
                  </p>
                )}
                {nights > 0 && isRoomFree === true && !overCapacity && (
                  <p className="text-accent">
                    {room.name} is free — {nights} {nights === 1 ? "night" : "nights"}.
                  </p>
                )}
              </div>
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="font-display text-2xl">Add an experience</legend>
              <p className="mt-2 text-sm text-muted-foreground">Optional — priced per booking.</p>
              <div className="mt-6 space-y-3">
                {activities.map((activity) => {
                  const selected = activityIds.includes(activity.id);
                  return (
                    <label
                      key={activity.id}
                      className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-5 transition-colors ${
                        selected ? "border-accent" : "border-border/70 hover:border-accent/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setActivityIds((current) =>
                            current.includes(activity.id)
                              ? current.filter((id) => id !== activity.id)
                              : [...current, activity.id],
                          )
                        }
                        className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      />
                      <div className="flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-display text-lg">{activity.name}</h3>
                          <span className="font-display text-lg text-accent">
                            ${activity.price}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{activity.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === 3 && room && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                createBooking.mutate({
                  guestName,
                  guestEmail,
                  guestPhone: guestPhone.trim() || undefined,
                  roomId: room.id,
                  checkIn,
                  checkOut,
                  guests,
                  activityIds,
                  paymentMethod,
                  notes: notes.trim() || undefined,
                });
              }}
            >
              <fieldset disabled={createBooking.isPending}>
                <legend className="font-display text-2xl">Who shall we expect?</legend>
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="guestName">Full name</Label>
                    <Input
                      id="guestName"
                      required
                      value={guestName}
                      onChange={(event) => setGuestName(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="guestEmail">Email</Label>
                    <Input
                      id="guestEmail"
                      type="email"
                      required
                      value={guestEmail}
                      onChange={(event) => setGuestEmail(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="guestPhone">Phone (optional)</Label>
                    <Input
                      id="guestPhone"
                      value={guestPhone}
                      onChange={(event) => setGuestPhone(event.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="notes">Anything we should know? (optional)</Label>
                    <textarea
                      id="notes"
                      rows={3}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className="mt-2 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
                    />
                  </div>
                </div>

                <h3 className="mt-10 font-display text-xl">How will you pay?</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  {paymentMethods.map((method) => (
                    <label
                      key={method.value}
                      className={`cursor-pointer rounded-full border px-5 py-2.5 text-sm transition-colors ${
                        paymentMethod === method.value
                          ? "border-accent text-accent"
                          : "border-border/70 text-muted-foreground hover:border-accent/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={method.value}
                        checked={paymentMethod === method.value}
                        onChange={() => setPaymentMethod(method.value)}
                        className="sr-only"
                      />
                      {method.label}
                    </label>
                  ))}
                </div>

                {createBooking.isError && (
                  <p className="mt-5 text-sm text-destructive" role="alert">
                    {createBooking.error.message}
                  </p>
                )}

                <button
                  type="submit"
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-8 py-3.5 font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {createBooking.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Request this stay
                </button>
              </fieldset>
            </form>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-6">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm transition-colors hover:border-accent/50 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {step < 3 && (
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(3, current + 1))}
              disabled={!canContinue}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <BookingSummary
        room={room}
        checkIn={checkIn}
        checkOut={checkOut}
        guests={guests}
        activities={chosenActivities}
      />
    </div>
  );
}

function Confirmation({
  booking,
}: {
  booking: { reference: string; roomName: string; totalAmount: number; guestEmail: string };
}) {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent/40">
        <Check className="h-6 w-6 text-accent" />
      </div>
      <h2 className="mt-7 font-display text-4xl font-light">Your room is held</h2>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        We have your request for the {booking.roomName}. The lodge will confirm by email at{" "}
        {booking.guestEmail} once payment is verified.
      </p>

      <dl className="mt-9 rounded-2xl border border-border/70 bg-card p-6 text-left">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-display text-2xl tracking-wider text-accent">{booking.reference}</dd>
        </div>
        <div className="mt-4 flex justify-between gap-4 border-t border-border/70 pt-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-display text-2xl">${booking.totalAmount}</dd>
        </div>
      </dl>

      <p className="mt-6 text-sm text-muted-foreground">
        Keep that reference — it is how we find your stay.
      </p>

      <Link
        href="/"
        className="mt-9 inline-block rounded-full border border-border px-8 py-3 transition-colors hover:border-accent/50"
      >
        Back to the lodge
      </Link>
    </div>
  );
}
