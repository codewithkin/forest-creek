"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PriceMonth, type CalendarDay } from "@/components/price-calendar/price-month";
import { trpc } from "@/utils/trpc";

import { monthRange, type MonthCursor } from "./calendar-month";

function currentMonth(): MonthCursor {
  const today = new Date();
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() };
}

/**
 * The price calendar for staff: every date of a room with its price. Click
 * dates (shift-click for a run of them), enter a price, and set it — or put
 * them back on the room's default rate. Booked nights are frozen: they show
 * the booking and can't be selected.
 */
export default function PriceCalendarPanel({ propertyId }: { propertyId: string }) {
  const rooms = useQuery(trpc.properties.rooms.queryOptions({ propertyId }));
  const [roomId, setRoomId] = useState<string>();
  const [cursor, setCursor] = useState<MonthCursor>(currentMonth);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string>();
  const [price, setPrice] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!roomId && rooms.data?.length) setRoomId(rooms.data[0]!.id);
  }, [roomId, rooms.data]);

  const range = monthRange(cursor);
  const calendar = useQuery({
    ...trpc.properties.roomPriceCalendar.queryOptions({ roomId: roomId ?? "", ...range }),
    enabled: Boolean(roomId),
  });
  const days = calendar.data?.days ?? [];

  const save = useMutation(
    trpc.properties.setNightlyPrices.mutationOptions({
      onSuccess: (result, variables) => {
        toast.success(
          variables.price === null
            ? `${result.priced} date${result.priced === 1 ? "" : "s"} back on the default rate`
            : `$${variables.price} set on ${result.priced} date${result.priced === 1 ? "" : "s"}`,
        );
        setSelected(new Set());
        setPrice("");
        void queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const selectable = (day: CalendarDay) => !day.past && !day.booked;

  function click(day: CalendarDay, event: React.MouseEvent) {
    setSelected((current) => {
      const next = new Set(current);
      if (event.shiftKey && anchor) {
        const [from, to] = anchor < day.date ? [anchor, day.date] : [day.date, anchor];
        for (const candidate of days) {
          if (candidate.date >= from && candidate.date <= to && selectable(candidate)) next.add(candidate.date);
        }
      } else if (next.has(day.date)) next.delete(day.date);
      else next.add(day.date);
      return next;
    });
    setAnchor(day.date);
  }

  function selectAllOpen() {
    setSelected(new Set(days.filter(selectable).map((day) => day.date)));
  }

  const room = rooms.data?.find((candidate) => candidate.id === roomId);
  const chosen = [...selected].sort();
  const amount = Number(price);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg">Price calendar</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Select dates and set their nightly price. Dates without their own price use the room&rsquo;s default rate.
            Booked nights are frozen.
          </p>
        </div>
        {rooms.data && rooms.data.length > 0 && (
          <label className="text-xs text-muted-foreground">
            Room
            <select
              value={roomId}
              onChange={(event) => {
                setRoomId(event.target.value);
                setSelected(new Set());
              }}
              className="mt-1 block rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
            >
              {rooms.data.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} (default ${candidate.pricePerNight})
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {rooms.data?.length === 0 && <p className="mt-4 text-sm text-muted-foreground">Add a room first.</p>}

      {roomId && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <PriceMonth
            cursor={cursor}
            onMonthChange={(next) => {
              setCursor(next);
              setSelected(new Set());
            }}
            days={days}
            loading={calendar.isPending}
            subtitle="Select dates, then set their price"
            isSelected={(day) => selected.has(day.date)}
            isDisabled={(day) => !selectable(day)}
            onDayClick={click}
            dayLabel={(day) => day.reference}
          />

          <div className="rounded-2xl border border-border/70 bg-card p-4 text-sm xl:self-start">
            <p className="font-medium">
              {chosen.length === 0 ? "No dates selected" : `${chosen.length} date${chosen.length === 1 ? "" : "s"} selected`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click dates to select them; shift-click selects every open date in between.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={selectAllOpen} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent/50">
                Whole month
              </button>
              {chosen.length > 0 && (
                <button type="button" onClick={() => setSelected(new Set())} className="rounded-full border border-border px-3 py-1.5 text-xs hover:border-accent/50">
                  Clear selection
                </button>
              )}
            </div>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!roomId || chosen.length === 0 || !(amount > 0)) return;
                save.mutate({ roomId, dates: chosen, price: Math.round(amount) });
              }}
            >
              <label className="text-xs text-muted-foreground">
                Price per night (USD)
                <input
                  type="number"
                  min={1}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder={room ? String(room.pricePerNight) : ""}
                  className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="submit"
                disabled={save.isPending || chosen.length === 0 || !(amount > 0)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Set price
              </button>
              <button
                type="button"
                disabled={save.isPending || chosen.length === 0}
                onClick={() => roomId && save.mutate({ roomId, dates: chosen, price: null })}
                className="mt-2 w-full rounded-full border border-border px-4 py-2 text-xs hover:border-accent/50 disabled:opacity-50"
              >
                Use the default rate{room ? ` ($${room.pricePerNight})` : ""}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
