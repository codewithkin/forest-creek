"use client";

import { useId, useMemo, useRef, useState } from "react";

/*
 * Plain SVG charts: no charting dependency, so the dashboard bundle stays
 * small. Colours were run through the dataviz palette validator against the
 * card surface (#15312b), dark mode: every check passes. Hues are assigned in
 * this fixed order and follow the entity, never its rank.
 */
export const SERIES = ["#B58D1E", "#4A9BE0", "#D9694F", "#2BA98A", "#9478DE"] as const;
/** Fifth and beyond fold into "Other", never a generated colour. */
export const OTHER = "#6F8A83";

const GRID = "hsl(168 20% 22%)";

/** A tiny line with no axes, inside a stat tile. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const width = 80;
  const height = 28;
  const peak = Math.max(...values);
  const low = Math.min(...values);
  const span = peak - low || 1;
  const points = values.map((value, index) => [
    (index / (values.length - 1)) * (width - 6) + 3,
    height - 4 - ((value - low) / span) * (height - 8),
  ]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label} className="h-7 w-full">
      <polyline
        points={points.map((point) => point.join(",")).join(" ")}
        fill="none"
        stroke={SERIES[0]}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

function compact(value: number): string {
  return value >= 1_000 ? `${Number((value / 1_000).toFixed(2))}K` : String(Math.round(value));
}

export type AreaPoint = { label: string; value: number };

/**
 * One measure over time: a 2px line over a faint wash, with a crosshair and
 * tooltip on hover. One axis only: two measures get two charts.
 */
export function AreaChart({
  points,
  format,
  label,
  height = 220,
}: {
  points: AreaPoint[];
  format: (value: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
  height?: number;
}) {
  const width = 720;
  const pad = { top: 12, right: 12, bottom: 24, left: 44 };
  const gradient = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number>();

  const { path, area, ticks, xOf, yOf } = useMemo(() => {
    const top = niceMax(Math.max(...points.map((point) => point.value), 0));
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    const xOf = (index: number) => pad.left + (points.length > 1 ? (index / (points.length - 1)) * innerWidth : innerWidth / 2);
    const yOf = (value: number) => pad.top + innerHeight - (value / top) * innerHeight;
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${xOf(index)},${yOf(point.value)}`).join(" ");
    const area = `${path} L${xOf(points.length - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`;
    return { path, area, ticks: [0, top / 2, top], xOf, yOf };
  }, [points, height, pad.bottom, pad.left, pad.right, pad.top]);

  if (points.length === 0) return <p className="text-sm text-muted-foreground">Nothing to show for this period yet.</p>;

  const active = hover === undefined ? undefined : points[hover];
  const everyNth = Math.max(1, Math.ceil(points.length / 7));

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const x = ((event.clientX - box.left) / box.width) * width;
    const position = (x - pad.left) / (width - pad.left - pad.right);
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(position * (points.length - 1)))));
  }

  return (
    <div className="relative">
      <svg
        ref={svg}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        className="w-full touch-pan-y"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(undefined)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yOf(tick)} y2={yOf(tick)} stroke={GRID} strokeWidth={1} />
            <text x={pad.left - 8} y={yOf(tick) + 4} textAnchor="end" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {compact(tick)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={path} fill="none" stroke={SERIES[0]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) =>
          index % everyNth === 0 ? (
            <text key={point.label} x={xOf(index)} y={height - 6} textAnchor="middle" fontSize={11} fill="currentColor" className="text-muted-foreground">
              {point.label}
            </text>
          ) : null,
        )}
        {hover !== undefined && active && (
          <>
            <line x1={xOf(hover)} x2={xOf(hover)} y1={pad.top} y2={yOf(0)} stroke={GRID} strokeWidth={1} />
            <circle cx={xOf(hover)} cy={yOf(active.value)} r={5} fill={SERIES[0]} stroke="#15312b" strokeWidth={2} />
          </>
        )}
      </svg>
      {hover !== undefined && active && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${Math.min(88, Math.max(12, (xOf(hover) / width) * 100))}%` }}
        >
          <span className="text-muted-foreground">{active.label}</span>
          <span className="ml-2 font-medium">{format(active.value)}</span>
        </div>
      )}
    </div>
  );
}

export type BarItem = { key: string; label: string; value: number; display?: string; hint?: string };

/** Ranked amounts: the label, a thin bar from one baseline, and the figure. */
export function BarList({ items, format }: { items: BarItem[]; format: (value: number) => string }) {
  const peak = Math.max(...items.map((item) => item.value), 1);
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nothing to show for this period yet.</p>;
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.key} title={item.display ?? format(item.value)}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 text-muted-foreground">
              {item.display ?? format(item.value)}
              {item.hint && <span className="ml-2 text-xs">{item.hint}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-secondary">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (item.value / peak) * 100)}%`, background: SERIES[0] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export type Slice = { key: string; label: string; value: number };

/** Share of a whole, up to four parts plus Other, with a legend carrying the figures. */
export function Donut({ slices, format, center }: { slices: Slice[]; format: (value: number) => string; center?: React.ReactNode }) {
  const [hover, setHover] = useState<string>();
  const parts = useMemo(() => {
    const ordered = [...slices].filter((slice) => slice.value > 0);
    const kept = ordered.slice(0, 4).map((slice, index) => ({ ...slice, color: SERIES[index]! as string }));
    const rest = ordered.slice(4).reduce((sum, slice) => sum + slice.value, 0);
    return rest > 0 ? [...kept, { key: "other", label: "Other", value: rest, color: OTHER }] : kept;
  }, [slices]);

  const total = parts.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">Nothing to show for this period yet.</p>;

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  // The 2px gap between segments is surface, drawn by shortening each arc.
  const gap = parts.length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 100 100" className="-rotate-90" role="img" aria-label={parts.map((part) => `${part.label} ${format(part.value)}`).join(", ")}>
          {parts.map((part) => {
            const length = (part.value / total) * circumference;
            const dash = Math.max(0.5, length - gap);
            const circle = (
              <circle
                key={part.key}
                cx={50}
                cy={50}
                r={radius}
                fill="none"
                stroke={part.color}
                strokeWidth={hover === part.key ? 12 : 10}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                onPointerEnter={() => setHover(part.key)}
                onPointerLeave={() => setHover(undefined)}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {parts.map((part) => (
          <li
            key={part.key}
            onPointerEnter={() => setHover(part.key)}
            onPointerLeave={() => setHover(undefined)}
            className="flex items-center gap-2"
          >
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: part.color }} />
            <span className="min-w-0 flex-1 truncate">{part.label}</span>
            <span className="shrink-0 text-muted-foreground">
              {format(part.value)} · {Math.round((part.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
