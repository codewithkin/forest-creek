"use client";

import { money } from "./kpi";

type Day = { date: string; roomRevenue: number; roomNightsSold: number };

/**
 * Plain SVG bars rather than a charting dependency — one series, no
 * interaction beyond a tooltip, and it keeps the dashboard bundle small.
 */
export default function RevenueChart({ days }: { days: Day[] }) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">No revenue in this period yet.</p>;
  }

  const peak = Math.max(...days.map((day) => day.roomRevenue), 1);
  const total = days.reduce((sum, day) => sum + day.roomRevenue, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-xl">Room revenue by night</p>
        <p className="text-sm text-muted-foreground">{money(total)} total</p>
      </div>

      <div className="mt-5 flex h-36 items-end gap-[2px] sm:gap-1">
        {days.map((day) => {
          const height = (day.roomRevenue / peak) * 100;
          const isToday = day.date === today;
          return (
            <div key={day.date} className="group relative flex-1" title={`${day.date} · ${money(day.roomRevenue)}`}>
              <div
                style={{ height: `${Math.max(height, day.roomRevenue > 0 ? 4 : 1.5)}%` }}
                className={`w-full rounded-t-sm transition-colors ${
                  isToday
                    ? "bg-accent"
                    : day.roomRevenue > 0
                      ? "bg-accent/40 group-hover:bg-accent/70"
                      : "bg-border/60"
                }`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[0.65rem] text-muted-foreground">
        <span>{days[0]!.date.slice(5)}</span>
        <span>{days[days.length - 1]!.date.slice(5)}</span>
      </div>
    </div>
  );
}
