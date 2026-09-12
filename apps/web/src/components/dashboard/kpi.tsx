"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

export function money(value: number): string {
  return "$" + Math.round(value).toLocaleString("en-US");
}

export function percent(value: number, digits = 0): string {
  return (value * 100).toFixed(digits) + "%";
}

/**
 * Percentage-point change for rates, relative change for money. Returns null
 * when there is no previous figure to compare against, so the card shows
 * nothing rather than a meaningless +100%.
 */
function delta(current: number, previous: number, kind: "rate" | "amount") {
  if (kind === "rate") {
    const points = (current - previous) * 100;
    if (Math.abs(points) < 0.05) return { label: "flat", direction: "flat" as const };
    return {
      label: (points > 0 ? "+" : "") + points.toFixed(1) + "pts",
      direction: points > 0 ? ("up" as const) : ("down" as const),
    };
  }
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return { label: "flat", direction: "flat" as const };
  return {
    label: (change > 0 ? "+" : "") + change.toFixed(0) + "%",
    direction: change > 0 ? ("up" as const) : ("down" as const),
  };
}

export function KpiCard({
  label,
  value,
  current,
  previous,
  kind,
  hint,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  kind?: "rate" | "amount";
  hint?: string;
}) {
  const change =
    current !== undefined && previous !== undefined && kind
      ? delta(current, previous, kind)
      : null;

  const Icon =
    change?.direction === "up"
      ? ArrowUpRight
      : change?.direction === "down"
        ? ArrowDownRight
        : ArrowRight;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-display text-2xl sm:text-3xl">{value}</p>
      <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs">
        {change && (
          <span
            className={
              change.direction === "up"
                ? "inline-flex items-center gap-1 text-emerald-400"
                : change.direction === "down"
                  ? "inline-flex items-center gap-1 text-destructive"
                  : "inline-flex items-center gap-1 text-muted-foreground"
            }
          >
            <Icon className="h-3 w-3" />
            {change.label}
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}
