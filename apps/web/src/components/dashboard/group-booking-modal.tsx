"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, HandCoins, Layers, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { countNights, todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { friendlyError, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { sourceNames } from "./booking-labels";
import { money } from "./kpi";
import { useProperties } from "./property-context";
import { ChoiceCard, DoneStep, StepModal } from "./ui/steps";

const inputClass =
  "mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/50";

const steps = [
  { key: "guest", label: "Guest" },
  { key: "rooms", label: "Rooms & dates" },
  { key: "payment", label: "Price & payment" },
  { key: "done", label: "Done" },
] as const;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

type PaymentKey = "record" | "arrival" | "none";

/**
 * A group booking in four steps: who it is for, the dates and every room
 * (whole properties in one tap), one price and one payment, done. Each room
 * becomes its own booking under one group reference.
 */
export function GroupBookingModal({ onClose, onOpen }: { onClose: () => void; onOpen: (bookingId: string) => void }) {
  const { properties, selectedId } = useProperties();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [source, setSource] = useState("phone");
  const [checkIn, setCheckIn] = useState(todayIso());
  const [checkOut, setCheckOut] = useState(addDays(todayIso(), 1));
  const [chosen, setChosen] = useState<Map<string, number>>(new Map());
  const [agreed, setAgreed] = useState<string>();
  const [rateNote, setRateNote] = useState("");
  const [payment, setPayment] = useState<PaymentKey>("record");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer">("bank_transfer");
  const [paymentNote, setPaymentNote] = useState("");
  const [notes, setNotes] = useState("");

  const nights = countNights(checkIn, checkOut);
  const available = useQuery({ ...trpc.rooms.available.queryOptions({ checkIn, checkOut }), enabled: nights > 0 && step >= 1 });
  const inScope = new Set(properties.map((property) => property.id));

  // Free rooms for these dates, by property, only the properties this person runs.
  const byProperty = useMemo(() => {
    const groups = new Map<string, { name: string; rooms: NonNullable<typeof available.data> }>();
    for (const room of available.data ?? []) {
      if (!inScope.has(room.propertyId)) continue;
      const name = properties.find((property) => property.id === room.propertyId)?.name ?? "";
      groups.set(room.propertyId, { name, rooms: [...(groups.get(room.propertyId)?.rooms ?? []), room] });
    }
    // The property in view first.
    return [...groups.entries()].sort(([a], [b]) => (a === selectedId ? -1 : b === selectedId ? 1 : 0));
  }, [available.data, properties, selectedId]);

  const rooms = (available.data ?? []).filter((room) => chosen.has(room.id));
  const calendarTotal = rooms.reduce((sum, room) => sum + room.stay.subtotal, 0);
  const agreedTotal = agreed === undefined ? undefined : Number(agreed) || 0;
  const total = agreedTotal ?? calendarTotal;
  const guestCount = [...chosen.values()].reduce((sum, guests) => sum + guests, 0);

  const toggle = (room: { id: string; capacity: number }, on: boolean) =>
    setChosen((current) => {
      const next = new Map(current);
      if (on) next.set(room.id, room.capacity);
      else next.delete(room.id);
      return next;
    });

  const create = useMutation(
    trpc.bookings.createGroup.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setStep(3);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const paymentReady =
    (payment !== "record" || (Number(amount) > 0 && Number(amount) <= total && paymentNote.trim())) &&
    (agreed === undefined || (Number(agreed) > 0 && rateNote.trim()));

  function submit() {
    create.mutate({
      rooms: rooms.map((room) => ({ roomId: room.id, guests: chosen.get(room.id) ?? 1 })),
      checkIn,
      checkOut,
      guestName,
      guestEmail,
      guestPhone: guestPhone || undefined,
      notes: notes || undefined,
      source: source as "phone",
      agreedTotal: agreedTotal,
      rateNote: agreedTotal !== undefined ? rateNote : undefined,
      payment: payment === "record" ? { kind: "record", amount: Math.round(Number(amount)), method, note: paymentNote } : { kind: payment },
    });
  }

  const next =
    step === 0
      ? { label: "Next", form: "group-guest", disabled: !guestName.trim() }
      : step === 1
        ? { label: "Next", onClick: () => setStep(2), disabled: rooms.length === 0 || nights <= 0 }
        : step === 2
          ? { label: `Book ${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`, onClick: submit, disabled: !paymentReady, pending: create.isPending }
          : undefined;

  const result = create.data;

  return (
    <StepModal
      title="Group booking"
      description="Many rooms for one guest, entered once."
      icon={<Layers className="size-4" />}
      size={step === 1 ? "xl" : "lg"}
      steps={steps}
      current={step}
      onClose={onClose}
      onBack={step > 0 && step < 3 ? () => setStep(step - 1) : undefined}
      next={next}
      aside={
        step >= 1 && step < 3 && rooms.length > 0 ? (
          <span>
            {rooms.length} {rooms.length === 1 ? "room" : "rooms"} · {guestCount} guests · {nights} {nights === 1 ? "night" : "nights"} ·{" "}
            <span key={total} className="ml-1 inline-block animate-rise-in font-display text-xl">
              {money(total)}
            </span>
          </span>
        ) : undefined
      }
    >
      {step === 0 && (
        <form
          id="group-guest"
          onSubmit={(event) => {
            event.preventDefault();
            if (guestName.trim()) setStep(1);
          }}
          className="space-y-4"
        >
          <label className="block text-xs">
            Guest or group <span className="text-muted-foreground">(a person, a company, a wedding)</span>
            <input required autoFocus value={guestName} onChange={(event) => setGuestName(event.target.value)} placeholder="CBZ Trish" className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs">
              Phone
              <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className={inputClass} />
            </label>
            <label className="text-xs">
              Email
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
                  className={`rounded-full px-3 py-1.5 text-sm transition-all active:scale-95 ${source === key ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
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
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs">
              Arrive
              <input
                type="date"
                value={checkIn}
                onChange={(event) => {
                  setCheckIn(event.target.value);
                  if (checkOut <= event.target.value) setCheckOut(addDays(event.target.value, 1));
                  setChosen(new Map());
                }}
                className={inputClass}
              />
            </label>
            <label className="text-xs">
              Leave
              <input
                type="date"
                min={addDays(checkIn, 1)}
                value={checkOut}
                onChange={(event) => {
                  setCheckOut(event.target.value);
                  setChosen(new Map());
                }}
                className={inputClass}
              />
            </label>
            <p className="pb-3 text-sm text-muted-foreground">
              {nights} {nights === 1 ? "night" : "nights"}
            </p>
          </div>

          {available.isPending ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : byProperty.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">No rooms are free for those dates.</p>
          ) : (
            byProperty.map(([propertyId, group]) => {
              const all = group.rooms.every((room) => chosen.has(room.id));
              return (
                <section key={propertyId} className="animate-rise-in rounded-2xl border border-border/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-medium">{group.name}</h3>
                    <button
                      type="button"
                      onClick={() => group.rooms.forEach((room) => toggle(room, !all))}
                      className="text-xs text-accent hover:underline"
                    >
                      {all ? "Clear" : `All ${group.rooms.length} free rooms`}
                    </button>
                  </div>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.rooms.map((room) => {
                      const on = chosen.has(room.id);
                      return (
                        <li key={room.id}>
                          <div className={`rounded-xl border p-3 text-sm transition-all ${on ? "border-accent bg-accent/10" : "border-border/60"}`}>
                            <label className="flex cursor-pointer items-start gap-2">
                              <input type="checkbox" checked={on} onChange={(event) => toggle(room, event.target.checked)} className="mt-1 accent-[var(--color-accent)]" />
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium">{room.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {money(room.stay.subtotal)} · sleeps {room.capacity}
                                </span>
                              </span>
                            </label>
                            {on && (
                              <label className="mt-2 flex items-center justify-between gap-2 text-xs">
                                Guests
                                <input
                                  type="number"
                                  min={1}
                                  max={room.capacity}
                                  value={chosen.get(room.id)}
                                  onChange={(event) =>
                                    setChosen((current) => new Map(current).set(room.id, Math.min(room.capacity, Math.max(1, Number(event.target.value) || 1))))
                                  }
                                  className="w-16 rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
                                />
                              </label>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-2xl bg-secondary/50 px-4 py-3 text-sm">
            <span>
              {rooms.length} rooms at the calendar&rsquo;s prices: <span className="font-medium">{money(calendarTotal)}</span>
            </span>
            {agreed === undefined ? (
              <button type="button" onClick={() => setAgreed(String(calendarTotal))} className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                <Plus className="size-3.5" aria-hidden />
                Agreed a group price
              </button>
            ) : null}
          </div>
          {agreed !== undefined && (
            <div className="grid animate-rise-in gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              <label className="text-xs">
                Group price (USD)
                <input type="number" min={1} autoFocus value={agreed} onChange={(event) => setAgreed(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                Why?
                <input value={rateNote} onChange={(event) => setRateNote(event.target.value)} placeholder="Corporate rate" className={inputClass} />
              </label>
              <button type="button" onClick={() => setAgreed(undefined)} aria-label="Use the calendar's prices" className="justify-self-end rounded-full p-2 text-muted-foreground hover:bg-secondary">
                <X className="size-4" />
              </button>
            </div>
          )}

          <div className="grid gap-2.5 sm:grid-cols-3">
            <ChoiceCard name="payment" checked={payment === "record"} onChange={() => setPayment("record")} icon={<HandCoins className="size-4" />} title="Payment received" hint="A deposit or the lot, once" />
            <ChoiceCard name="payment" checked={payment === "arrival"} onChange={() => setPayment("arrival")} icon={<BadgeCheck className="size-4" />} title="Pays on arrival" hint="Confirmed now" />
            <ChoiceCard name="payment" checked={payment === "none"} onChange={() => setPayment("none")} icon={<Clock className="size-4" />} title="Not paid yet" hint="Under Maybe until paid" />
          </div>
          {payment === "record" && (
            <div className="grid animate-rise-in gap-3 sm:grid-cols-3">
              <label className="text-xs">
                Amount (USD)
                <input type="number" min={1} max={total} value={amount} placeholder={String(total)} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                How
                <select value={method} onChange={(event) => setMethod(event.target.value as "cash")} className={inputClass}>
                  <option value="bank_transfer" className="bg-popover">
                    Bank transfer
                  </option>
                  <option value="cash" className="bg-popover">
                    USD cash
                  </option>
                </select>
              </label>
              <label className="text-xs">
                Bank or receipt ref
                <input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="CBZ" className={inputClass} />
              </label>
              {Number(amount) > total && <p className="text-sm text-rose-300 sm:col-span-3">That&rsquo;s more than the group&rsquo;s {money(total)}.</p>}
              <p className="text-xs text-muted-foreground sm:col-span-3">It is shared across the rooms by their prices, so every room is secured; each gets its own receipt.</p>
            </div>
          )}
          <label className="block text-xs">
            Note (staff only)
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Breakfast included" className={inputClass} />
          </label>
        </div>
      )}

      {step === 3 && result && (
        <DoneStep
          title="Group booked"
          actions={
            <>
              <button type="button" onClick={() => void navigator.clipboard.writeText(result.groupRef ?? "").then(() => toast.success("Reference copied"))} className={buttonClass({ variant: "secondary", shape: "pill" })}>
                Copy {result.groupRef}
              </button>
              <button type="button" onClick={() => onOpen(result.bookings[0]!.id)} className={buttonClass({ shape: "pill" })}>
                Open the group
              </button>
            </>
          }
        >
          <span className="font-mono text-accent">{result.groupRef}</span>: {result.bookings.length} rooms for {guestName},{" "}
          {money(result.bookings.reduce((sum, booking) => sum + booking.totalAmount, 0))}
          {payment === "record" ? `, ${money(result.bookings.reduce((sum, booking) => sum + booking.amountPaid, 0))} paid` : ""}.
        </DoneStep>
      )}
    </StepModal>
  );
}
