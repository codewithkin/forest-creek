"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StayCalendar } from "@/components/booking/stay-calendar";
import { countNights, todayIso } from "@/components/booking/types";
import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { sourceNames } from "./booking-labels";
import { money } from "./kpi";
import { useProperties } from "./property-context";
import { Modal } from "./ui/overlay";

const inputClass =
  "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

const paymentChoices = [
  { key: "record", label: "Payment received", hint: "Cash or bank transfer already in hand" },
  { key: "arrival", label: "Pays on arrival", hint: "Confirmed now, on your word" },
  { key: "link", label: "Send payment link", hint: "Emails the guest how to pay" },
  { key: "none", label: "Not paid yet", hint: "A maybe: holds no room" },
] as const;

type PaymentKey = (typeof paymentChoices)[number]["key"];

/**
 * A booking taken by staff: at the door, on the phone, by email or through an
 * agent. Goes through the same room lock as a guest's, so a clash is refused
 * here with the reason rather than discovered later.
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
  const [payment, setPayment] = useState<PaymentKey>("record");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "bank_transfer">("cash");
  const [paymentNote, setPaymentNote] = useState("");

  const rooms = useQuery({ ...trpc.properties.rooms.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const activities = useQuery({ ...trpc.activities.manage.queryOptions({ propertyId }), enabled: Boolean(propertyId) });
  const activeRooms = rooms.data?.filter((room) => room.active) ?? [];
  const room = activeRooms.find((candidate) => candidate.id === roomId);
  const nights = countNights(checkIn, checkOut);

  const create = useMutation(
    trpc.bookings.createManual.mutationOptions({
      onSuccess: async (booking) => {
        toast.success(`${booking?.reference} saved`);
        await queryClient.invalidateQueries();
        if (booking) onCreated(booking.id);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const ready =
    Boolean(room && nights > 0 && guestName.trim()) &&
    (!agree || (Number(agreedRate) > 0 && rateNote.trim())) &&
    (payment !== "record" || (Number(amount) > 0 && paymentNote.trim())) &&
    (payment !== "link" || guestEmail.trim());

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;
    create.mutate({
      roomId,
      checkIn,
      checkOut,
      guests: Number(guests),
      guestName,
      guestEmail,
      guestPhone: guestPhone || undefined,
      activityIds,
      notes: notes || undefined,
      source: source as "walk-in",
      agreedRate: agree ? Math.round(Number(agreedRate)) : undefined,
      rateNote: agree ? rateNote : undefined,
      payment:
        payment === "record"
          ? { kind: "record", amount: Math.round(Number(amount)), method, note: paymentNote }
          : { kind: payment },
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={<CalendarPlus className="size-4" />}
      title="New booking"
      description="For guests who booked with you directly."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass({ variant: "ghost", shape: "pill" })}>
            Cancel
          </button>
          <button type="submit" form="new-booking" disabled={!ready || create.isPending} className={buttonClass({ shape: "pill" })}>
            {create.isPending && <Spinner />}
            Save booking
          </button>
        </>
      }
    >
      <form id="new-booking" onSubmit={submit} className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
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
          <label className="text-xs">
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
            How did they book?
            <select value={source} onChange={(event) => setSource(event.target.value)} className={inputClass}>
              {Object.entries(sourceNames).map(([key, label]) => (
                <option key={key} value={key} className="bg-popover">
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {room && (
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
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Guest name
            <input required value={guestName} onChange={(event) => setGuestName(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            Guests{room ? ` (sleeps ${room.capacity})` : ""}
            <input required type="number" min={1} max={room?.capacity} value={guests} onChange={(event) => setGuests(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            Email (optional)
            <input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} className={inputClass} />
          </label>
          <label className="text-xs">
            Phone (optional)
            <input value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className={inputClass} />
          </label>
        </div>

        {(activities.data?.length ?? 0) > 0 && (
          <fieldset>
            <legend className="text-xs">Experiences</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {activities.data?.filter((activity) => activity.active).map((activity) => (
                <label key={activity.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={activityIds.includes(activity.id)}
                      onChange={(event) =>
                        setActivityIds((current) => (event.target.checked ? [...current, activity.id] : current.filter((id) => id !== activity.id)))
                      }
                    />
                    {activity.name}
                  </span>
                  <span className="text-muted-foreground">{activity.price === 0 ? "Included" : money(activity.price)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
            Use an agreed rate instead of the calendar&rsquo;s
          </label>
          {agree && (
            <div className="mt-2 grid gap-3 sm:grid-cols-[10rem_1fr]">
              <label className="text-xs">
                Per night (USD)
                <input type="number" min={1} value={agreedRate} onChange={(event) => setAgreedRate(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                Why?
                <input value={rateNote} onChange={(event) => setRateNote(event.target.value)} placeholder="Returning guest" className={inputClass} />
              </label>
            </div>
          )}
        </div>

        <fieldset>
          <legend className="text-xs">Payment</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {paymentChoices.map((choice) => (
              <label
                key={choice.key}
                className={`cursor-pointer rounded-2xl border p-3 text-sm transition-colors ${
                  payment === choice.key ? "border-accent bg-accent/10" : "border-border/60 hover:border-accent/50"
                }`}
              >
                <input type="radio" name="payment" className="sr-only" checked={payment === choice.key} onChange={() => setPayment(choice.key)} />
                <span className="block font-medium">{choice.label}</span>
                <span className="block text-xs text-muted-foreground">{choice.hint}</span>
              </label>
            ))}
          </div>
          {payment === "record" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs">
                Amount (USD)
                <input type="number" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
              </label>
              <label className="text-xs">
                How
                <select value={method} onChange={(event) => setMethod(event.target.value as "cash")} className={inputClass}>
                  <option value="cash" className="bg-popover">USD cash</option>
                  <option value="bank_transfer" className="bg-popover">Bank transfer</option>
                </select>
              </label>
              <label className="text-xs">
                Reference
                <input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Receipt or bank ref" className={inputClass} />
              </label>
            </div>
          )}
        </fieldset>

        <label className="block text-xs">
          Notes (optional)
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} />
        </label>
      </form>
    </Modal>
  );
}
