"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CalendarPlus, Clock, HandCoins, Link2, Mail, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StayCalendar } from "@/components/booking/stay-calendar";
import { countNights, todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { sourceNames } from "./booking-labels";
import { money } from "./kpi";
import { useProperties } from "./property-context";
import { ChoiceCard, DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "guest", label: "Guest" },
  { key: "stay", label: "Stay" },
  { key: "payment", label: "Payment" },
  { key: "done", label: "Done" },
] as const;

const paymentChoices = [
  { key: "record", label: "Payment received", hint: "Cash or bank transfer already in hand", icon: HandCoins },
  { key: "arrival", label: "Pays on arrival", hint: "Confirmed now, on your word", icon: BadgeCheck },
  { key: "link", label: "Send payment link", hint: "Emails the guest how to pay", icon: Mail },
  { key: "none", label: "Not paid yet", hint: "Listed under Maybe until paid", icon: Clock },
] as const;

type PaymentKey = (typeof paymentChoices)[number]["key"];

/**
 * A booking taken by staff, in four steps: who, which room and nights (the
 * price comes from the calendar), how it is paid, done. Goes through the same
 * room lock as a guest's, so a clash is refused with the reason.
 */
export function NewBookingModal({
  onClose,
  onCreated,
  initial,
}: {
  onClose: () => void;
  onCreated: (bookingId: string) => void;
  /** Opened from a night on the calendar. */
  initial?: { propertyId: string; roomId: string; checkIn: string };
}) {
  const { selectedId, properties } = useProperties();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? selectedId ?? properties[0]?.id ?? "");
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? "");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [source, setSource] = useState("walk-in");
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [agreedRate, setAgreedRate] = useState("");
  const [rateNote, setRateNote] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [payment, setPayment] = useState<PaymentKey>("record");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer">("cash");
  const [paymentNote, setPaymentNote] = useState("");

  const rooms = useQuery({ ...trpc.properties.rooms.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const activities = useQuery({ ...trpc.activities.manage.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const activeRooms = rooms.data?.filter((room) => room.active) ?? [];
  const activeActivities = activities.data?.filter((activity) => activity.active) ?? [];
  const room = activeRooms.find((candidate) => candidate.id === roomId);
  const nights = countNights(checkIn, checkOut);
  const price = useQuery({
    ...trpc.quotes.priceRoom.queryOptions({ roomId, checkIn, checkOut }),
    enabled: Boolean(roomId) && nights > 0,
  });

  // What the system works out, for the running total: the calendar's rate
  // (or the agreed one) for every night, plus the experiences ticked.
  const rate = agree ? Number(agreedRate) || 0 : (price.data?.unitPrice ?? 0);
  const extras = activeActivities.filter((activity) => activityIds.includes(activity.id)).reduce((sum, activity) => sum + activity.price, 0);
  const total = rate * nights + extras;

  const create = useMutation(
    trpc.bookings.createManual.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setStep(3);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );
  const booking = create.data;

  const guestReady = Boolean(guestName.trim());
  const stayReady = Boolean(room && nights > 0) && (!agree || (Number(agreedRate) > 0 && rateNote.trim()));
  const paymentReady =
    (payment !== "record" || (Number(amount) > 0 && paymentNote.trim())) && (payment !== "link" || guestEmail.trim());

  function submit() {
    if (!guestReady || !stayReady || !paymentReady) return;
    create.mutate({
      roomId,
      checkIn,
      checkOut,
      guests: Number(guests),
      guestName,
      guestEmail,
      guestPhone: guestPhone || undefined,
      activityIds,
      notes: showNotes && notes ? notes : undefined,
      source: source as "walk-in",
      agreedRate: agree ? Math.round(Number(agreedRate)) : undefined,
      rateNote: agree ? rateNote : undefined,
      payment:
        payment === "record"
          ? { kind: "record", amount: Math.round(Number(amount)), method, note: paymentNote }
          : { kind: payment },
    });
  }

  function startOver() {
    create.reset();
    setStep(0);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setCheckIn("");
    setCheckOut("");
    setActivityIds([]);
    setAgree(false);
    setAmount("");
    setPaymentNote("");
    setNotes("");
    setShowNotes(false);
  }

  const next =
    step === 0
      ? { label: "Next", form: "booking-guest", disabled: !guestReady }
      : step === 1
        ? { label: "Next", onClick: () => setStep(2), disabled: !stayReady }
        : step === 2
          ? { label: "Save booking", onClick: submit, disabled: !paymentReady, pending: create.isPending }
          : undefined;

  const payLink = booking ? `${window.location.origin}/pay/${booking.reference}` : "";

  return (
    <StepModal
      title="New booking"
      description="For guests who booked with you directly."
      icon={<CalendarPlus className="size-4" />}
      steps={steps}
      current={step}
      onClose={onClose}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={
        step >= 1 && nights > 0 && room ? (
          <span>
            {nights} {nights === 1 ? "night" : "nights"} · Total{" "}
            <span key={total} className="ml-1 inline-block animate-rise-in font-display text-xl">
              {money(total)}
            </span>
          </span>
        ) : undefined
      }
    >
      {step === 0 && (
        <form
          id="booking-guest"
          onSubmit={(event) => {
            event.preventDefault();
            if (guestReady) setStep(1);
          }}
          className="space-y-4"
        >
          <label className="block text-xs">
            Guest name
            <input required autoFocus value={guestName} onChange={(event) => setGuestName(event.target.value)} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs">
              Phone <span className="text-muted-foreground">(optional)</span>
              <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} placeholder="0771 234 567" className={inputClass} />
            </label>
            <label className="text-xs">
              Email <span className="text-muted-foreground">(for the confirmation)</span>
              <input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className={inputClass} />
            </label>
          </div>
          <fieldset>
            <legend className="text-xs">How did they book?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(sourceNames).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={source === key}
                  onClick={() => setSource(key)}
                  className={`rounded-full px-3 py-1.5 text-sm transition-all active:scale-95 ${
                    source === key ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
            {properties.length > 1 && (
              <label className="text-xs">
                Property
                <select
                  value={propertyId}
                  onChange={(event) => {
                    setPropertyId(event.target.value);
                    setRoomId("");
                    setActivityIds([]);
                  }}
                  className={inputClass}
                >
                  {properties.map((property) => (
                    <option key={property.id} value={property.id} className="bg-popover">
                      {property.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={`text-xs ${properties.length > 1 ? "" : "sm:col-span-2"}`}>
              Room
              <select
                required
                value={roomId}
                onChange={(event) => {
                  setRoomId(event.target.value);
                  setCheckOut("");
                }}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a room
                </option>
                {activeRooms.map((candidate) => (
                  <option key={candidate.id} value={candidate.id} className="bg-popover">
                    {candidate.name} (sleeps {candidate.capacity})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Guests
              <input required type="number" min={1} max={room?.capacity} value={guests} onChange={(event) => setGuests(event.target.value)} className={inputClass} />
            </label>
          </div>

          {room ? (
            <div className="animate-rise-in">
              <StayCalendar
                key={room.id}
                roomId={room.id}
                today={todayIso()}
                checkIn={checkIn}
                checkOut={checkOut}
                allowPast
                onChange={(arrive, leave) => {
                  setCheckIn(arrive);
                  setCheckOut(leave);
                }}
              />
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              Choose a room to see its calendar and prices.
            </p>
          )}

          {activeActivities.length > 0 && (
            <div>
              <p className="text-xs">Experiences</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeActivities.map((activity) => {
                  const on = activityIds.includes(activity.id);
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setActivityIds((current) => (on ? current.filter((id) => id !== activity.id) : [...current, activity.id]))}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-all duration-200 active:scale-95 ${
                        on ? "border-accent bg-accent text-accent-foreground" : "border-border/60 hover:border-accent/60"
                      }`}
                    >
                      {activity.name} · {activity.price === 0 ? "included" : money(activity.price)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {!agree && (
              <button type="button" onClick={() => setAgree(true)} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Agreed a different price
              </button>
            )}
            {!showNotes && (
              <button type="button" onClick={() => setShowNotes(true)} className="inline-flex items-center gap-1 text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Note
              </button>
            )}
          </div>
          {agree && (
            <div className="grid animate-rise-in gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <label className="text-xs">
                Per night (USD)
                <input type="number" min={1} autoFocus value={agreedRate} onChange={(event) => setAgreedRate(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                Why?
                <input value={rateNote} onChange={(event) => setRateNote(event.target.value)} placeholder="Returning guest" className={inputClass} />
              </label>
              <button type="button" onClick={() => setAgree(false)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                Use the calendar
              </button>
            </div>
          )}
          {showNotes && (
            <label className="block animate-rise-in text-xs">
              Note (staff only)
              <textarea rows={2} autoFocus value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
            </label>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {paymentChoices.map((choice) => (
              <ChoiceCard
                key={choice.key}
                name="payment"
                checked={payment === choice.key}
                onChange={() => setPayment(choice.key)}
                icon={<choice.icon className="size-4" />}
                title={choice.label}
                hint={choice.key === "link" && !guestEmail ? "Needs an email: add one in step 1" : choice.hint}
                disabled={choice.key === "link" && !guestEmail}
              />
            ))}
          </div>
          {payment === "record" && (
            <div className="grid animate-rise-in gap-3 sm:grid-cols-3">
              <label className="text-xs">
                Amount (USD)
                <input type="number" min={1} autoFocus value={amount} placeholder={total ? String(total) : undefined} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                How
                <select value={method} onChange={(event) => setMethod(event.target.value as "cash")} className={inputClass}>
                  <option value="cash" className="bg-popover">
                    USD cash
                  </option>
                  <option value="bank_transfer" className="bg-popover">
                    Bank transfer
                  </option>
                </select>
              </label>
              <label className="text-xs">
                Receipt or bank ref
                <input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} className={inputClass} />
              </label>
            </div>
          )}
          <p className="rounded-2xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
            {guestName} · {room?.name} · {nights} {nights === 1 ? "night" : "nights"} from {checkIn} · <span className="text-foreground">{money(total)}</span>
          </p>
        </div>
      )}

      {step === 3 && booking && (
        <DoneStep
          title="Booking saved"
          actions={
            <>
              {(payment === "link" || payment === "none") && (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(payLink).then(() => toast.success("Payment link copied"))}
                  className={buttonClass({ variant: "secondary", shape: "pill" })}
                >
                  <Link2 aria-hidden />
                  Copy payment link
                </button>
              )}
              <button type="button" onClick={startOver} className={buttonClass({ variant: "ghost", shape: "pill" })}>
                <Plus aria-hidden />
                Another booking
              </button>
              <button type="button" onClick={() => onCreated(booking.id)} className={buttonClass({ shape: "pill" })}>
                Open booking
              </button>
            </>
          }
        >
          <p>
            <span className="font-mono text-accent">{booking.reference}</span> for {booking.guestName}, {money(booking.totalAmount)}.
          </p>
          <p className="mt-1">
            {payment === "record" && "The payment is recorded and the stay is confirmed."}
            {payment === "arrival" && "Confirmed: they pay when they arrive."}
            {payment === "link" && `We've emailed ${booking.guestEmail} how to pay.`}
            {payment === "none" && "It's under Maybe until a payment comes in."}
          </p>
        </DoneStep>
      )}
    </StepModal>
  );
}
