"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import {
  dayKey,
  daysInMonth,
  monthLabel,
  monthRange,
  shiftMonth,
  stayOn,
  type Stay,
} from "./calendar-month";
import { useProperties } from "./property-context";

const tone: Record<string, string> = {
  verified: "bg-emerald-500/70",
  processing: "bg-accent/70",
  pending: "bg-accent/40",
  rejected: "bg-destructive/50",
};

export default function AvailabilityCalendar() {
  const { selectedId, selected, properties, isLoading } = useProperties();
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getUTCFullYear(),
    month: today.getUTCMonth(),
  });
  // Managers who see every property still have to pick one: a calendar of two
  // houses' rooms side by side says less than one house's does.
  const propertyId = selectedId ?? properties[0]?.id;
  const [openStay, setOpenStay] = useState<string>();
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const range = monthRange(cursor);
  const days = Array.from({ length: daysInMonth(cursor.year, cursor.month) }, (_, i) => i + 1);

  const occupancy = useQuery({
    // monthRange ends on the first of the next month; the query reads it as
    // exclusive, so the last night of this month is included exactly once.
    ...trpc.bookings.occupancy.queryOptions({ propertyId: propertyId ?? "", range }),
    enabled: Boolean(propertyId),
  });

  const cancel = useMutation(
    trpc.bookings.cancel.mutationOptions({
      onSuccess: async (booking) => {
        toast.success(`${booking.reference} cancelled — those nights are free again`);
        setOpenStay(undefined);
        setReason("");
        // Occupancy, today's counts and the bookings list all move together.
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  function step(by: number) {
    setCursor((current) => shiftMonth(current, by));
  }

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Availability</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected?.name ?? properties[0]?.name ?? "No property"} · every occupied night, and
            who is in the room.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="rounded-full border border-border p-2 hover:border-accent/50"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm">
            {monthLabel(cursor.year, cursor.month)}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next month"
            className="rounded-full border border-border p-2 hover:border-accent/50"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>

      {occupancy.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}

      {occupancy.isError && (
        <ErrorMessage
          title="The calendar didn't load"
          error={occupancy.error}
          onRetry={() => void occupancy.refetch()}
        />
      )}

      {occupancy.data?.length === 0 && (
        <StateMessage
          icon={CalendarRange}
          title="No rooms at this property yet"
          description="Add a room under Properties and its nights will appear here."
        />
      )}

      {occupancy.data && occupancy.data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Room</th>
                {days.map((day) => (
                  <th key={day} className="w-7 px-0 py-2 text-center font-normal text-muted-foreground">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {occupancy.data.map((room) => (
                <tr key={room.roomId} className="border-t border-border/50">
                  <td className="sticky left-0 z-10 max-w-[10rem] truncate bg-card px-3 py-2">
                    {room.roomName}
                    {!room.active && (
                      <span className="ml-1.5 text-muted-foreground">(hidden)</span>
                    )}
                  </td>
                  {days.map((day) => {
                    const date = dayKey(cursor.year, cursor.month, day);
                    const stay = stayOn(room.stays as Stay[], date);
                    if (!stay) {
                      return <td key={day} className="h-9 border-l border-border/30 bg-transparent" />;
                    }
                    return (
                      <td key={day} className="h-9 border-l border-border/30 p-0.5">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenStay((current) =>
                              current === stay.bookingId ? undefined : stay.bookingId,
                            )
                          }
                          title={`${stay.reference} — ${stay.guestName}`}
                          aria-label={`${stay.reference}, ${stay.guestName}, ${date}`}
                          className={`h-full w-full rounded-sm transition-opacity hover:opacity-80 ${
                            tone[stay.paymentStatus] ?? "bg-secondary"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-emerald-500/70" /> Paid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-accent/70" /> Charge sent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-accent/40" /> Awaiting payment
        </span>
        <span>Tap an occupied night to see the stay, or free it.</span>
      </div>

      {/* The stay behind whichever block was tapped, with the release button. */}
      {occupancy.data
        ?.flatMap((room) => (room.stays as Stay[]).map((stay) => ({ room, stay })))
        .filter(({ stay }) => stay.bookingId === openStay)
        .map(({ room, stay }) => (
          <div
            key={stay.bookingId}
            className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-sm tracking-wider text-accent">{stay.reference}</span>
              <span className="font-medium">{stay.guestName}</span>
              <span className="text-xs text-muted-foreground">
                {room.roomName} · {stay.checkIn} → {stay.checkOut} · {stay.nights}{" "}
                {stay.nights === 1 ? "night" : "nights"} · via{" "}
                {stay.channel === "whatsapp" ? "WhatsApp" : "the website"}
              </span>
            </div>

            <label className="mt-4 block text-sm">
              Why is this being released?
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Guest called off — optional, kept on the booking"
                className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={cancel.isPending}
                onClick={() =>
                  cancel.mutate({ id: stay.bookingId, reason: reason.trim() || undefined })
                }
                className={buttonClass({ variant: "danger", size: "sm" })}
              >
                {cancel.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Cancel and free these nights
              </button>
              <button
                type="button"
                onClick={() => { setOpenStay(undefined); setReason(""); }}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                Keep the booking
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}
