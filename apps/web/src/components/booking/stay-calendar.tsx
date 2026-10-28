"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { monthRange, type MonthCursor } from "@/components/dashboard/calendar-month";
import { PriceMonth, type CalendarDay } from "@/components/price-calendar/price-month";
import { trpc } from "@/utils/trpc";

function cursorOf(day: string): MonthCursor {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1 };
}

function formatDay(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * The guest's date picker: the chosen room's calendar with each night's price
 * and the nights already booked greyed out. Click the arrival day, then the
 * departure day. A booked night can still be a departure day — one guest
 * leaves the morning the next arrives — but a stay can't run through one.
 */
export function StayCalendar({
  roomId,
  today,
  checkIn,
  checkOut,
  onChange,
}: {
  roomId: string;
  today: string;
  checkIn: string;
  checkOut: string;
  onChange: (checkIn: string, checkOut: string) => void;
}) {
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorOf(checkIn || today));
  // Every day seen so far, across months, so a stay running into next month
  // can be checked for booked nights on the way.
  const [known, setKnown] = useState<Map<string, CalendarDay>>(new Map());

  const calendar = useQuery(trpc.rooms.priceCalendar.queryOptions({ roomId, ...monthRange(cursor) }));
  const days = calendar.data?.days ?? [];

  useEffect(() => setKnown(new Map()), [roomId]);
  useEffect(() => {
    if (!calendar.data) return;
    setKnown((current) => {
      const next = new Map(current);
      for (const day of calendar.data!.days) next.set(day.date, day);
      return next;
    });
  }, [calendar.data]);

  const taken = (day: CalendarDay) => day.booked || day.blocked;
  const pickingDeparture = Boolean(checkIn) && !checkOut;

  /** True when every night from checkIn up to (not including) `departure` is free. */
  function clearUntil(departure: string): boolean {
    for (const [date, day] of known) {
      if (date >= checkIn && date < departure && taken(day)) return false;
    }
    return true;
  }

  function isDisabled(day: CalendarDay): boolean {
    if (day.past) return true;
    if (!taken(day)) return false;
    // A booked night may be the morning the guest leaves.
    return !(pickingDeparture && day.date > checkIn && clearUntil(day.date));
  }

  function click(day: CalendarDay) {
    if (!pickingDeparture || day.date <= checkIn) {
      if (!taken(day)) onChange(day.date, "");
      return;
    }
    if (clearUntil(day.date)) onChange(checkIn, day.date);
    else if (!taken(day)) onChange(day.date, "");
  }

  const nightsChosen = checkIn && checkOut ? [...known.values()].filter((day) => day.date >= checkIn && day.date < checkOut) : [];
  const total = nightsChosen.reduce((sum, day) => sum + day.price, 0);

  return (
    <div>
      <PriceMonth
        cursor={cursor}
        onMonthChange={setCursor}
        days={days}
        loading={calendar.isPending}
        canGoBack={`${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}` > today.slice(0, 7)}
        subtitle={pickingDeparture ? "Now choose the day you leave" : "Choose the day you arrive"}
        isSelected={(day) => Boolean(checkIn) && (day.date === checkIn || (Boolean(checkOut) && day.date > checkIn && day.date <= checkOut))}
        isDisabled={isDisabled}
        onDayClick={click}
      />
      <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
        {!checkIn && "Prices are per night and differ by date."}
        {pickingDeparture && `Arriving ${formatDay(checkIn)} — now pick your departure day.`}
        {checkIn && checkOut && (
          <>
            {formatDay(checkIn)} → {formatDay(checkOut)}
            {nightsChosen.length > 0 && ` · ${nightsChosen.length} ${nightsChosen.length === 1 ? "night" : "nights"}, $${total}`}{" "}
            <button type="button" onClick={() => onChange("", "")} className="ml-1 text-accent underline underline-offset-4">
              Change dates
            </button>
          </>
        )}
      </p>
    </div>
  );
}
