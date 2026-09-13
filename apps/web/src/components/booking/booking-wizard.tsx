"use client";

import { Input } from "@forest-creek/ui/components/input";
import { Label } from "@forest-creek/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BedDouble, Check, Smartphone, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { resolveImage } from "@/components/dashboard/image-upload";
import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { mediaUrl } from "@/lib/server-url";
import { trpc } from "@/utils/trpc";

import BookingSummary from "./booking-summary";
import type { BookableActivity, BookableRoom, PaymentMethodValue } from "./types";
import { countNights, paymentMethods, todayIso } from "./types";

const steps = ["Property", "Your Room", "Dates & Guests", "Experiences", "Details & Payment"];

export type BookableProperty = {
  id: string;
  slug: string;
  name: string;
  location: string;
  heroImage: string;
};

type Props = {
  properties: BookableProperty[];
  rooms: BookableRoom[];
  activities: BookableActivity[];
  initialPropertyId?: string;
};

export default function BookingWizard({
  properties,
  rooms,
  activities,
  initialPropertyId,
}: Props) {
  // A single-property group has nothing to choose, so that step is skipped.
  const onlyProperty = properties.length === 1 ? properties[0]!.id : undefined;
  const startingProperty = initialPropertyId ?? onlyProperty;
  const minStep = startingProperty ? 1 : 0;

  const [propertyId, setPropertyId] = useState<string | undefined>(startingProperty);
  const [step, setStep] = useState(minStep);
  const [roomId, setRoomId] = useState<string>();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("ecocash");
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState("");

  const propertyRooms = rooms.filter((candidate) => candidate.propertyId === propertyId);
  const propertyActivities = activities.filter(
    (candidate) => candidate.propertyId === propertyId,
  );
  const room = propertyRooms.find((candidate) => candidate.id === roomId);
  const nights = countNights(checkIn, checkOut);
  const chosenActivities = propertyActivities.filter((activity) =>
    activityIds.includes(activity.id),
  );
  const today = todayIso();

  const availability = useQuery({
    ...trpc.rooms.available.queryOptions({ checkIn, checkOut, propertyId }),
    enabled: nights > 0,
  });

  const isRoomFree =
    availability.data === undefined
      ? undefined
      : availability.data.some((candidate) => candidate.id === roomId);

  const createBooking = useMutation(trpc.bookings.create.mutationOptions());
  const initiatePayment = useMutation(trpc.bookings.payWithMobileMoney.mutationOptions());

  // Fires once, right after the booking exists — a real charge to the
  // guest's own phone, not a redirect, so there is nothing for them to click.
  const bookingReference = createBooking.data?.reference;
  const paymentStarted = useRef(false);
  useEffect(() => {
    if (!bookingReference || paymentStarted.current) return;
    paymentStarted.current = true;
    initiatePayment.mutate({ reference: bookingReference, mobileMoneyNumber });
    // mobileMoneyNumber is captured at the moment of booking, not re-read live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingReference]);

  const paymentCheck = useQuery({
    ...trpc.bookings.checkPayment.queryOptions({ reference: bookingReference ?? "" }),
    enabled: Boolean(bookingReference) && initiatePayment.data?.ok === true,
    refetchInterval: (query) => (query.state.data?.ok && query.state.data.paid ? false : 4000),
  });
  const confirmed = paymentCheck.data?.ok === true && paymentCheck.data.paid;

  // Each step swaps the content under the guest's thumb; bring the top of the
  // wizard back into view, but not on first render, which would jump the page.
  const wizardRef = useRef<HTMLDivElement>(null);
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    wizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  if (createBooking.data) {
    return (
      <PaymentPanel
        booking={createBooking.data}
        initiatePayment={initiatePayment}
        paymentCheck={paymentCheck}
        confirmed={confirmed}
        onRetryCheck={() => void paymentCheck.refetch()}
      />
    );
  }

  const overCapacity = room !== undefined && guests > room.capacity;
  const canLeaveDates = nights > 0 && !overCapacity && isRoomFree === true;

  const canContinue =
    [propertyId !== undefined, roomId !== undefined, canLeaveDates, true, false][step] ?? false;

  return (
    <div ref={wizardRef} className="grid scroll-mt-24 gap-10 lg:grid-cols-[1fr_20rem]">
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
              <legend className="font-display text-2xl">Which property?</legend>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {properties.map((candidate) => (
                  <label
                    key={candidate.id}
                    className={`cursor-pointer overflow-hidden rounded-2xl border text-left transition-colors ${
                      propertyId === candidate.id
                        ? "border-accent"
                        : "border-border/70 hover:border-accent/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="property"
                      value={candidate.id}
                      checked={propertyId === candidate.id}
                      onChange={() => {
                        setPropertyId(candidate.id);
                        setRoomId(undefined);
                        setActivityIds([]);
                      }}
                      className="sr-only"
                    />
                    <img
                      src={resolveImage(candidate.heroImage)}
                      alt={candidate.name}
                      className="aspect-[16/10] w-full object-cover"
                    />
                    <div className="p-5">
                      <h3 className="font-display text-xl">{candidate.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{candidate.location}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="font-display text-2xl">Choose your room</legend>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {propertyRooms.map((candidate) => (
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

          {step === 2 && room && (
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
                  <p className="inline-flex items-center gap-2 text-muted-foreground">
                    <Spinner /> Checking those nights…
                  </p>
                )}
                {nights > 0 && availability.isError && (
                  <p className="text-destructive">
                    We couldn&rsquo;t check those dates just now.{" "}
                    <button
                      type="button"
                      onClick={() => void availability.refetch()}
                      className="font-medium underline underline-offset-4"
                    >
                      Try again
                    </button>
                  </p>
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

          {step === 3 && (
            <fieldset>
              <legend className="font-display text-2xl">Add an experience</legend>
              <p className="mt-2 text-sm text-muted-foreground">Optional — priced per booking.</p>
              <div className="mt-6 space-y-3">
                {propertyActivities.map((activity) => {
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

          {step === 4 && room && (
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
                <p className="mt-1 text-sm text-muted-foreground">
                  Mobile money only — we&rsquo;ll send a payment prompt straight to the number below.
                </p>
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
                <div className="mt-5 max-w-sm">
                  <Label htmlFor="mobileMoneyNumber">
                    {paymentMethods.find((method) => method.value === paymentMethod)?.label} number
                  </Label>
                  <Input
                    id="mobileMoneyNumber"
                    type="tel"
                    required
                    placeholder="07XX XXX XXX"
                    value={mobileMoneyNumber}
                    onChange={(event) => setMobileMoneyNumber(event.target.value)}
                    className="mt-2"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    The number registered to this account — it may not be the phone number above.
                  </p>
                </div>

                {createBooking.isError && (
                  <p className="mt-5 text-sm text-destructive" role="alert">
                    {friendlyError(createBooking.error)}
                  </p>
                )}

                <button
                  type="submit"
                  className={buttonClass({ shape: "pill", size: "lg", className: "mt-8 w-full sm:w-auto" })}
                >
                  {createBooking.isPending && <Spinner />}
                  {createBooking.isPending ? "Requesting your stay…" : "Request this stay"}
                </button>
              </fieldset>
            </form>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 pt-6">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(minStep, current - 1))}
            disabled={step === minStep}
            className={buttonClass({ variant: "secondary", shape: "pill" })}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {step < 4 && (
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(4, current + 1))}
              disabled={!canContinue}
              className={buttonClass({ shape: "pill" })}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <BookingSummary
        propertyName={properties.find((candidate) => candidate.id === propertyId)?.name}
        room={room}
        checkIn={checkIn}
        checkOut={checkOut}
        guests={guests}
        activities={chosenActivities}
      />
    </div>
  );
}

type InitiatePaymentResult =
  | { ok: true; reference: string; amountUsd: number; instructions: string }
  | { ok: false; error: string };

type CheckPaymentResult =
  | { ok: true; paid: boolean; bookingStatus: string; paymentStatus: string }
  | { ok: false; error: string };

type Booking = { reference: string; roomName: string; totalAmount: number; guestEmail: string };

function PaymentPanel({
  booking,
  initiatePayment,
  paymentCheck,
  confirmed,
  onRetryCheck,
}: {
  booking: Booking;
  initiatePayment: {
    data?: InitiatePaymentResult;
    isPending: boolean;
    isError: boolean;
    error?: { message?: string } | null;
  };
  paymentCheck: { data?: CheckPaymentResult; isFetching: boolean };
  confirmed: boolean;
  onRetryCheck: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <ReferenceCard booking={booking} confirmed={confirmed} />

      {confirmed ? (
        <>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            Payment received — your stay is confirmed. We&rsquo;ll email {booking.guestEmail} with the
            details.
          </p>
          <Link
            href="/"
            className={buttonClass({ variant: "secondary", shape: "pill", size: "lg", className: "mt-9" })}
          >
            Back to the lodge
          </Link>
        </>
      ) : initiatePayment.isPending ? (
        <p className="mt-6 inline-flex items-center gap-2 text-muted-foreground">
          <Spinner /> Sending a payment prompt to your phone…
        </p>
      ) : initiatePayment.isError || initiatePayment.data?.ok === false ? (
        <>
          <p className="mt-6 leading-relaxed text-destructive">
            {initiatePayment.data?.ok === false
              ? initiatePayment.data.error
              : friendlyError(initiatePayment.error)}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Your room is still held under {booking.reference}. The lodge will be in touch to arrange
            payment.
          </p>
        </>
      ) : (
        <>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            {initiatePayment.data?.instructions}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
            {paymentCheck.isFetching ? <Spinner /> : null} Waiting for you to approve it on your phone…
          </p>
          <button
            type="button"
            onClick={onRetryCheck}
            disabled={paymentCheck.isFetching}
            className={buttonClass({ variant: "secondary", shape: "pill", className: "mt-5" })}
          >
            I&rsquo;ve approved it — check now
          </button>
          <p className="mt-6 text-xs text-muted-foreground">
            Keep {booking.reference} handy — it is how we find your stay if you need to contact the lodge.
          </p>
        </>
      )}
    </div>
  );
}

function ReferenceCard({ booking, confirmed }: { booking: Booking; confirmed: boolean }) {
  return (
    <>
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${
          confirmed ? "border-accent/40" : "border-border/70"
        }`}
      >
        {confirmed ? (
          <Check className="h-6 w-6 text-accent" />
        ) : (
          <Smartphone className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <h2 className="mt-7 font-display text-4xl font-light">
        {confirmed ? "You're all set" : "Check your phone"}
      </h2>

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
    </>
  );
}
