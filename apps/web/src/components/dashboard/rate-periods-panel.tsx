"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Loader2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

import { money } from "./kpi";

const field =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

function shortDate(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Prices by date for one property: a different nightly price on chosen dates
 * (a season, a holiday, an event) for one or several rooms. Every quote and
 * booking — the website, both assistants, date changes — charges nights inside
 * a period at its price; bookings already made keep theirs.
 */
export default function RatePeriodsPanel({ propertyId }: { propertyId: string }) {
  const periods = useQuery(trpc.properties.ratePeriods.queryOptions({ propertyId }));
  const rooms = useQuery(trpc.properties.rooms.queryOptions({ propertyId }));
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const queryClient = useQueryClient();

  const remove = useMutation(
    trpc.properties.removeRatePeriod.mutationOptions({
      onSuccess: () => {
        setConfirmDelete(undefined);
        void queryClient.invalidateQueries();
      },
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg">Price ranges</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A different nightly price on chosen dates. Other nights keep each room&rsquo;s own price; bookings already made
            keep theirs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={!rooms.data?.length}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs hover:border-accent/50 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          Add a price
        </button>
      </div>

      {adding && rooms.data && (
        <div className="mt-4">
          <RatePeriodForm
            rooms={rooms.data}
            onClose={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              void queryClient.invalidateQueries();
            }}
          />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {periods.isPending && <div className="h-14 animate-pulse rounded-xl bg-secondary" />}
        {periods.data?.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">No special prices — every night costs each room&rsquo;s own price.</p>
        )}
        {periods.data?.map((period) => (
          <div key={period.id} className="rounded-xl border border-border/70 bg-card">
            <div className="flex items-center gap-4 p-3">
              <CalendarRange className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  {period.name} · <span className="text-muted-foreground">{period.roomName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {period.from === period.lastNight
                    ? `Night of ${shortDate(period.from)}`
                    : `Nights of ${shortDate(period.from)} to ${shortDate(period.lastNight)}`}{" "}
                  · {money(period.pricePerNight)}/night{" "}
                  <span className="opacity-70">(normally {money(period.normalRate)})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConfirmDelete(period.id);
                  remove.reset();
                }}
                aria-label={`Remove ${period.name} for ${period.roomName}`}
                className="rounded-full border border-border p-2 hover:border-destructive/60 hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            {confirmDelete === period.id && (
              <div className="flex flex-wrap items-center gap-3 border-t border-border/70 bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Remove this price? Those nights go back to {money(period.normalRate)}; existing bookings keep their price.
                </p>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: period.id })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-4 py-1.5 text-xs text-destructive-foreground disabled:opacity-50"
                >
                  {remove.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(undefined)}
                  className="rounded-full border border-border px-4 py-1.5 text-xs"
                >
                  Keep
                </button>
                {remove.error && <p className="w-full text-xs text-destructive">{remove.error.message}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RatePeriodForm({
  rooms,
  onClose,
  onSaved,
}: {
  rooms: { id: string; name: string; pricePerNight: number }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [lastNight, setLastNight] = useState("");
  const [price, setPrice] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>(rooms.map((room) => room.id));
  const create = useMutation(trpc.properties.createRatePeriods.mutationOptions({ onSuccess: onSaved }));

  const toggle = (id: string) =>
    setRoomIds((current) => (current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    create.mutate({ name, from, lastNight, pricePerNight: Number(price), roomIds });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border/70 bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-display text-base">New price</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <fieldset disabled={create.isPending} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">
          Name
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Christmas, Peak season…" className={field} />
        </label>
        <label className="text-sm">
          First night
          <input required type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="text-sm">
          Last night
          <input required type="date" min={from || undefined} value={lastNight} onChange={(e) => setLastNight(e.target.value)} className={field} />
          <span className="mt-1 block text-xs text-muted-foreground">Guests checking out the next morning pay this price for that night</span>
        </label>
        <label className="text-sm">
          Price per night (USD)
          <input required type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </label>
        <div className="text-sm sm:col-span-2">
          Rooms
          <div className="mt-1.5 flex flex-wrap gap-2">
            {rooms.map((room) => (
              <label
                key={room.id}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  roomIds.includes(room.id) ? "border-accent/60 bg-accent/10" : "border-border"
                }`}
              >
                <input type="checkbox" checked={roomIds.includes(room.id)} onChange={() => toggle(room.id)} className="sr-only" />
                {room.name} <span className="text-muted-foreground">({money(room.pricePerNight)})</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      {create.error && <p className="mt-3 text-sm text-destructive">{create.error.message}</p>}
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={create.isPending || roomIds.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save price
        </button>
        <button type="button" onClick={onClose} className="rounded-full border border-border px-5 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
