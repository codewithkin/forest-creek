"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

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
  pageSize = 25,
  footer,
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
}) {
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const [page, setPage] = useState(0);

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

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
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
            {shown.map((row, rowIndex) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                // Rows settle in one after another; past the first dozen, at once.
                style={{ animationDelay: `${Math.min(rowIndex, 12) * 25}ms` }}
                className={`animate-rise-in border-b border-border/40 last:border-0 ${onRowClick ? "cursor-pointer transition-colors hover:bg-secondary/50" : ""}`}
              >
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
            ))}
          </tbody>
        </table>
      </div>
      {footer ??
        (pages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-40"
            >
              <ChevronLeft className="size-3.5" /> Prev
            </button>
            <span>
              Page {current + 1} of {pages}
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
        ))}
    </div>
  );
}
