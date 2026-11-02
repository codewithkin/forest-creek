"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/brand/state";

export type Column<Row> = {
  key: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  /** Present on columns that can be sorted. */
  sortValue?: (row: Row) => string | number;
  align?: "left" | "right";
  /** Hidden below this width; the row's first columns should carry the essentials. */
  hideBelow?: "sm" | "md" | "lg";
  className?: string;
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/**
 * The dashboard's table: sortable headers, clickable rows, "Page 1 of 8".
 * Sorts and pages the rows it is given; a screen with more rows than it can
 * load pages on the server and passes `footer` instead.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowLabel,
  loading,
  empty,
  pageSize: initialPageSize = 25,
  footer,
  selection,
  rowProps,
  rowClassName,
}: {
  columns: Column<Row>[];
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  /** What a row is, for screen readers: "Open FC-ABC234". */
  rowLabel?: (row: Row) => string;
  loading?: boolean;
  empty: React.ReactNode;
  pageSize?: number;
  footer?: React.ReactNode;
  /** Ticks on every row and a select-all in the header; the screen owns the set and its bulk actions. */
  selection?: { selected: Set<string>; onChange: (next: Set<string>) => void };
  /** Extra attributes per row: drag and drop. */
  rowProps?: (row: Row) => React.HTMLAttributes<HTMLTableRowElement>;
  rowClassName?: (row: Row) => string;
}) {
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const sorted = useMemo(() => {
    const column = columns.find((candidate) => candidate.key === sort?.key);
    if (!rows || !column?.sortValue || !sort) return rows ?? [];
    const value = column.sortValue;
    return [...rows].sort((a, b) => {
      const [left, right] = [value(a), value(b)];
      const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
      return sort.descending ? -order : order;
    });
  }, [columns, rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = sorted.slice(current * pageSize, (current + 1) * pageSize);

  if (loading) {
    return (
      <div className="space-y-2 rounded-3xl border border-border/60 bg-card p-4">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows && rows.length === 0) return <>{empty}</>;

  const selected = selection?.selected;
  const shownKeys = shown.map(rowKey);
  const allKeys = sorted.map(rowKey);
  const pageAll = Boolean(selected) && shownKeys.length > 0 && shownKeys.every((key) => selected!.has(key));
  const pageSome = Boolean(selected) && shownKeys.some((key) => selected!.has(key));
  const everything = Boolean(selected) && allKeys.length > 0 && allKeys.every((key) => selected!.has(key));
  const toggle = (keys: string[], on: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    selection.onChange(next);
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              {selection && (
                <th scope="col" className="w-10 py-3 pl-4">
                  <Checkbox
                    checked={pageAll}
                    indeterminate={!pageAll && pageSome}
                    onChange={(on) => toggle(shownKeys, on)}
                    label={pageAll ? "Clear this page" : "Select everything on this page"}
                  />
                </th>
              )}
              {columns.map((column) => {
                const sorted = sort?.key === column.key;
                const align = column.align === "right" ? "text-right" : "text-left";
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sorted ? (sort.descending ? "descending" : "ascending") : undefined}
                    className={`px-4 py-3 font-normal whitespace-nowrap ${align} ${column.hideBelow ? HIDE[column.hideBelow] : ""}`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPage(0);
                          setSort((now) =>
                            now?.key === column.key ? { key: column.key, descending: !now.descending } : { key: column.key, descending: false },
                          );
                        }}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {column.header}
                        {sorted && (sort.descending ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {selection && pageAll && !everything && sorted.length > shown.length && (
              <tr className="border-b border-border/40 bg-accent/5">
                <td colSpan={columns.length + 1} className="px-4 py-2 text-center text-xs">
                  All {shown.length} on this page are selected.{" "}
                  <button type="button" onClick={() => toggle(allKeys, true)} className="font-medium text-accent hover:underline">
                    Select all {sorted.length}
                  </button>
                </td>
              </tr>
            )}
            {shown.map((row, rowIndex) => {
              const key = rowKey(row);
              const ticked = selected?.has(key) ?? false;
              return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // Rows settle in one after another; past the first dozen, at once.
                style={{ animationDelay: `${Math.min(rowIndex, 12) * 25}ms` }}
                {...rowProps?.(row)}
                className={`animate-rise-in border-b border-border/40 last:border-0 ${onRowClick ? "cursor-pointer transition-colors hover:bg-secondary/50" : ""} ${ticked ? "bg-accent/[0.07]" : ""} ${rowClassName?.(row) ?? ""}`}
              >
                {selection && (
                  <td className="w-10 py-3 pl-4 align-middle" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={ticked} onChange={(on) => toggle([key], on)} label={`Select ${rowLabel?.(row) ?? "row"}`} />
                  </td>
                )}
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={`px-4 py-3 align-middle ${column.align === "right" ? "text-right" : ""} ${column.hideBelow ? HIDE[column.hideBelow] : ""} ${column.className ?? ""}`}
                  >
                    {/* The first cell carries a real button, so rows work from the keyboard. */}
                    {index === 0 && onRowClick ? (
                      <button
                        type="button"
                        aria-label={rowLabel?.(row)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowClick(row);
                        }}
                        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {column.render(row)}
                      </button>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer ??
        (sorted.length > 10 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <label className="inline-flex items-center gap-2">
              Rows
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
                className="rounded-lg border border-border bg-transparent px-1.5 py-1 text-foreground"
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size} className="bg-popover">
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" /> Prev
              </button>
              <span>
                {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
              </span>
              <button
                type="button"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-40"
              >
                Next <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
    </div>
  );
}

/** A checkbox in the dashboard's style, with the "some" state a select-all needs. */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
      className="size-4 cursor-pointer rounded accent-[var(--color-accent)]"
    />
  );
}
