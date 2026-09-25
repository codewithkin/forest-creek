"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarRange, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import {
  blockOn,
  dayKey,
  daysInMonth,
  monthLabel,
  monthRange,
  shiftMonth,
  stayOn,
  type Block,
  type Stay,
} from "./calendar-month";
import { useProperties } from "./property-context";

// Diagonal hatching: reads as "off sale" at a glance, distinct from any stay colour.
const blockedCell =
  "bg-[repeating-linear-gradient(135deg,var(--color-muted-foreground)_0_1.5px,transparent_1.5px_6px)] opacity-50";

const inputClass =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

const tone: Record<string, string> = {
  verified: "bg-emerald-500/70",
  processing: "bg-accent/70",
  partial: "bg-sky-500/60",
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
  const [openBlock, setOpenBlock] = useState<string>();
  const [blocking, setBlocking] = useState(false);
  const [blockForm, setBlockForm] = useState({ roomId: "", from: "", to: "", reason: "" });
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
        toast.success(`${booking.reference} cancelled — those nights are available again`);
        setOpenStay(undefined);
        setReason("");
        // Occupancy, today's counts and the bookings list all move together.
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const block = useMutation(
    trpc.bookings.blockDates.mutationOptions({
      onSuccess: async () => {
        toast.success("Those nights are off sale");
        setBlocking(false);
        setBlockForm({ roomId: "", from: "", to: "", reason: "" });
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const unblock = useMutation(
    trpc.bookings.unblockDates.mutationOptions({
      onSuccess: async () => {
        toast.success("Those nights are back on sale");
        setOpenBlock(undefined);
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

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBlocking((open) => !open);
              setOpenStay(undefined);
              setOpenBlock(undefined);
            }}
            aria-expanded={blocking}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            <Ban aria-hidden />
            Block dates
          </button>
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

      {blocking && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            block.mutate({ ...blockForm, reason: blockForm.reason.trim() });
          }}
          className="animate-fade-in rounded-2xl border border-border/70 bg-card p-4 sm:p-5"
        >
          <p className="font-medium">Take a room off sale</p>
          <p className="mt-1 text-sm text-muted-foreground">
            For maintenance, the owners&rsquo; own use or a closed season. Guests can&rsquo;t book
            those nights on the website or WhatsApp until you lift it.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-sm">
              Room
              <select
                required
                value={blockForm.roomId}
                onChange={(event) => setBlockForm({ ...blockForm, roomId: event.target.value })}
                className={inputClass}
              >
                <option value="" disabled>
                  Choose a room
                </option>
                {occupancy.data?.map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.roomName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              First night off sale
              <input
                type="date"
                required
                value={blockForm.from}
                onChange={(event) => setBlockForm({ ...blockForm, from: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              Back on sale from
              <input
                type="date"
                required
                min={blockForm.from || undefined}
                value={blockForm.to}
                onChange={(event) => setBlockForm({ ...blockForm, to: event.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              Reason
              <input
                required
                maxLength={200}
                value={blockForm.reason}
                onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })}
                placeholder="Repainting"
                className={inputClass}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={block.isPending}
              className={buttonClass({ size: "sm" })}
            >
              {block.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Block these nights
            </button>
            <button
              type="button"
              onClick={() => setBlocking(false)}
              className={buttonClass({ variant: "ghost", size: "sm" })}
            >
              Never mind
            </button>
          </div>
        </form>
      )}

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
                    const blocked = stay ? undefined : blockOn(room.blocks as Block[], date);
                    if (blocked) {
                      return (
                        <td key={day} className="h-9 border-l border-border/30 p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenStay(undefined);
                              setOpenBlock((current) =>
                                current === blocked.id ? undefined : blocked.id,
                              );
                            }}
                            title={`Blocked — ${blocked.reason}`}
                            aria-label={`Blocked, ${blocked.reason}, ${date}`}
                            className={`h-full w-full rounded-sm transition-opacity hover:opacity-80 ${blockedCell}`}
                          />
                        </td>
                      );
                    }
                    if (!stay) {
                      return <td key={day} className="h-9 border-l border-border/30 bg-transparent" />;
                    }
                    return (
                      <td key={day} className="h-9 border-l border-border/30 p-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenBlock(undefined);
                            setOpenStay((current) =>
                              current === stay.bookingId ? undefined : stay.bookingId,
                            );
                          }}
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
        <span className="inline-flex items-center gap-1.5">
          <span className={`size-3 rounded-sm ${blockedCell}`} /> Blocked
        </span>
        <span>Tap a night to see the stay or block, or release it.</span>
      </div>

      {/* The block behind whichever hatched night was tapped, with the lift button. */}
      {occupancy.data
        ?.flatMap((room) => (room.blocks as Block[]).map((b) => ({ room, block: b })))
        .filter(({ block: b }) => b.id === openBlock)
        .map(({ room, block: b }) => (
          <div key={b.id} className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">{room.roomName} is off sale</span>
              <span className="text-xs text-muted-foreground">
                {b.from} → {b.to} · {b.reason} · by {b.createdBy}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={unblock.isPending}
                onClick={() => unblock.mutate(b.id)}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {unblock.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Put these nights back on sale
              </button>
              <button
                type="button"
                onClick={() => setOpenBlock(undefined)}
                className={buttonClass({ variant: "ghost", size: "sm" })}
              >
                Keep it blocked
              </button>
            </div>
          </div>
        ))}

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
                Cancel and release these nights
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
