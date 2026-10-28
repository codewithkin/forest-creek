"use client";

import { ChevronLeft, ChevronRight, Lock } from "lucide-react";

import { daysInMonth, monthLabel, shiftMonth, type MonthCursor } from "@/components/dashboard/calendar-month";

/*
 * One month of a room's price calendar, shared by the dashboard (staff set
 * prices) and the booking page (guests pick dates). Each date shows its price,
 * coloured from cheapest to dearest; booked and blocked nights are frozen.
 * Dates are UTC days throughout, like every stay date in this app.
 */

export type CalendarDay = {
  date: string;
  price: number;
  ownPrice: boolean;
  booked: boolean;
  blocked: boolean;
  past: boolean;
  reference?: string;
};

/** Cheapest to dearest — the legend and every priced date use these. */
export const BANDS = [
  { cell: "bg-emerald-600/85 text-white", dot: "bg-emerald-500", label: "Lowest" },
  { cell: "bg-teal-600/85 text-white", dot: "bg-teal-500", label: "Low" },
  { cell: "bg-blue-600/85 text-white", dot: "bg-blue-500", label: "Medium" },
  { cell: "bg-violet-600/85 text-white", dot: "bg-violet-500", label: "High" },
  { cell: "bg-rose-600/85 text-white", dot: "bg-rose-500", label: "Highest" },
] as const;

/** Five equal price bands between the month's lowest and highest price (see priceBand in packages/db). */
export function bandOf(price: number, lowest: number, highest: number): number {
  if (highest <= lowest) return 2;
  return Math.min(4, Math.floor(((price - lowest) / (highest - lowest)) * 5));
}

/** The band boundaries for the legend: "$45 – $50" for each band. */
export function bandRanges(lowest: number, highest: number): string[] {
  if (highest <= lowest) return BANDS.map((_, index) => (index === 2 ? `$${lowest}` : "—"));
  const step = (highest - lowest) / 5;
  return BANDS.map((_, index) => {
    const from = Math.round(lowest + step * index);
    const to = index === 4 ? highest : Math.round(lowest + step * (index + 1)) - 1;
    return from >= to ? `$${from}` : `$${from} – $${to}`;
  });
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PriceMonth({
  cursor,
  onMonthChange,
  days,
  loading,
  canGoBack = true,
  subtitle,
  isSelected,
  isDisabled,
  onDayClick,
  dayLabel,
}: {
  cursor: MonthCursor;
  onMonthChange: (cursor: MonthCursor) => void;
  /** The month's days, in order (may be empty while loading). */
  days: CalendarDay[];
  loading?: boolean;
  canGoBack?: boolean;
  subtitle?: string;
  isSelected: (day: CalendarDay) => boolean;
  isDisabled: (day: CalendarDay) => boolean;
  onDayClick: (day: CalendarDay, event: React.MouseEvent) => void;
  /** Extra line under the price (e.g. a booking reference for staff). */
  dayLabel?: (day: CalendarDay) => string | undefined;
}) {
  const open = days.filter((day) => !day.past && !day.booked && !day.blocked);
  const prices = (open.length > 0 ? open : days).map((day) => day.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  const highest = prices.length ? Math.max(...prices) : 0;
  const leading = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
  const ranges = bandRanges(lowest, highest);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(cursor, -1))}
          disabled={!canGoBack}
          aria-label="Previous month"
          className="rounded-full border border-border p-2 hover:border-accent/50 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="font-display text-xl">{monthLabel(cursor.year, cursor.month)}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(cursor, 1))}
          aria-label="Next month"
          className="rounded-full border border-border p-2 hover:border-accent/50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground sm:gap-1.5">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday}>{weekday}</div>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: leading }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {loading || days.length === 0
          ? Array.from({ length: daysInMonth(cursor.year, cursor.month) }, (_, index) => (
              <div key={index} className="aspect-square animate-pulse rounded-lg bg-secondary sm:aspect-[5/4]" />
            ))
          : days.map((day) => {
              const taken = day.booked || day.blocked;
              const disabled = isDisabled(day);
              const selected = isSelected(day);
              const extra = dayLabel?.(day);
              const tone = taken
                ? "bg-secondary/80 text-muted-foreground"
                : day.past
                  ? "bg-secondary/30 text-muted-foreground/50"
                  : BANDS[bandOf(day.price, lowest, highest)]!.cell;
              return (
                <button
                  key={day.date}
                  type="button"
                  disabled={disabled}
                  onClick={(event) => onDayClick(day, event)}
                  aria-pressed={selected}
                  aria-label={`${day.date}: ${taken ? (day.booked ? "booked" : "unavailable") : `$${day.price} a night`}`}
                  className={`relative flex aspect-square flex-col justify-between rounded-lg p-1 text-left transition sm:aspect-[5/4] sm:p-1.5 ${tone} ${
                    selected ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : ""
                  } ${disabled ? "cursor-not-allowed" : "hover:brightness-110"}`}
                >
                  <span className="text-[10px] leading-none sm:text-xs">{Number(day.date.slice(8))}</span>
                  {day.past ? null : taken ? (
                    <span className="flex items-center gap-0.5 text-[9px] leading-none sm:text-[11px]">
                      <Lock className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{extra ?? (day.booked ? "Booked" : "Closed")}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] leading-none font-semibold sm:text-sm">
                      ${day.price}
                      {day.ownPrice && extra && <span className="block text-[8px] font-normal opacity-80 sm:text-[10px]">{extra}</span>}
                    </span>
                  )}
                </button>
              );
            })}
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {BANDS.map((band, index) => (
          <span key={band.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${band.dot}`} />
            {ranges[index]} <span className="opacity-70">({band.label})</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> Booked
        </span>
      </div>
    </div>
  );
}
