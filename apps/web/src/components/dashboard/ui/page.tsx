"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Search, type LucideIcon } from "lucide-react";

import { Skeleton } from "@/components/brand/state";

/*
 * The dashboard's building blocks. Every screen is made of these, so spacing,
 * radius and tone are decided once. Layouts follow the design references (soft
 * rounded cards, tinted stat tiles, pill filters) in Forest Creek's own dark
 * green and gold.
 */

/** The title row of a screen: what it is, what it covers, and its main actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** The one card surface. */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`animate-rise-in rounded-3xl border border-border/60 bg-card p-4 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-display text-xl">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TILE_TONES = {
  neutral: "bg-card",
  gold: "bg-accent/10",
  clay: "bg-primary/25",
  moss: "bg-chart-3/15",
  sage: "bg-chart-4/15",
} as const;

export type TileTone = keyof typeof TILE_TONES;

export type Change = { label: string; direction: "up" | "down" | "flat" };

/** A headline number. Tinted tiles lead a screen; neutral ones fill out a row. */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  change,
  hint,
  loading,
  chart,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: TileTone;
  change?: Change | null;
  hint?: React.ReactNode;
  loading?: boolean;
  /** A small trend beside the figure. */
  chart?: React.ReactNode;
}) {
  const ChangeIcon = change?.direction === "up" ? ArrowUpRight : change?.direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div
      className={`group animate-rise-in rounded-3xl border border-border/60 p-4 transition-[transform,border-color] duration-300 hover:-translate-y-0.5 hover:border-accent/40 sm:p-5 ${TILE_TONES[tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background/50 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
            <Icon className="size-4 text-accent" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 min-w-0 font-display text-2xl sm:text-3xl">
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          // Keyed by the figure, so a new number rises in rather than snapping.
          <span key={String(value)} className="inline-block animate-rise-in">
            {value}
          </span>
        )}
      </div>
      {chart && !loading && <div className="mt-2">{chart}</div>}
      {(change || hint) && (
        <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {change && (
            <span
              className={`inline-flex items-center gap-1 rounded-full bg-background/50 px-2 py-0.5 ${
                change.direction === "up"
                  ? "text-emerald-300"
                  : change.direction === "down"
                    ? "text-rose-300"
                    : "text-muted-foreground"
              }`}
            >
              <ChangeIcon className="size-3" aria-hidden />
              {change.label}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}

/** A row of mutually exclusive choices: tabs, periods, filters. */
export function FilterPills<Key extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: Key; label: string; count?: number }[];
  value: Key;
  onChange: (key: Key) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-border/60 bg-card p-1">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="tab"
          aria-selected={value === option.key}
          onClick={() => onChange(option.key)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
            value === option.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option.label}
          {option.count !== undefined && option.count > 0 && (
            <span className={`rounded-full px-1.5 text-xs ${value === option.key ? "bg-background/20" : "bg-secondary"}`}>
              {option.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-border/60 bg-card pr-4 pl-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

const CHIP_TONES = {
  neutral: "bg-secondary text-muted-foreground",
  gold: "bg-accent/15 text-accent",
  good: "bg-emerald-500/15 text-emerald-300",
  info: "bg-sky-500/15 text-sky-300",
  bad: "bg-destructive/15 text-rose-300",
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

/** A state, always in words: colour only reinforces it. */
export function StatusChip({ tone = "neutral", children }: { tone?: ChipTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${CHIP_TONES[tone]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
