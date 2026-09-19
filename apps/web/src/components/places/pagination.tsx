import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { placesHref, type PlacesQuery } from "@/lib/places-query";

/** First, last, and a window around the current page; gaps become an ellipsis. */
function pageList(page: number, pageCount: number): Array<number | "gap"> {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  for (const n of pages) {
    const last = out.at(-1);
    if (typeof last === "number" && n - last > 1) out.push(n - last === 2 ? last + 1 : "gap");
    out.push(n);
  }
  return out;
}

const item =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm transition-colors";

export default function Pagination({
  query,
  page,
  pageCount,
}: {
  query: PlacesQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => placesHref({ ...query, page: target }) as Route;
  const edge = `${item} gap-1 border border-border hover:border-accent/60 hover:text-accent`;
  const disabled = `${item} gap-1 border border-border/40 text-muted-foreground/50`;

  return (
    <nav aria-label="Pages" className="mt-14 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} className={edge} rel="prev">
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : (
        <span className={disabled} aria-disabled>
          <ChevronLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Previous</span>
        </span>
      )}

      <ol className="flex items-center gap-1">
        {pageList(page, pageCount).map((entry, index) =>
          entry === "gap" ? (
            <li key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
              …
            </li>
          ) : (
            <li key={entry}>
              {entry === page ? (
                <span aria-current="page" className={`${item} bg-accent font-medium text-accent-foreground`}>
                  {entry}
                </span>
              ) : (
                <Link href={href(entry)} className={`${item} hover:bg-secondary`} aria-label={`Page ${entry}`}>
                  {entry}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>

      {page < pageCount ? (
        <Link href={href(page + 1)} className={edge} rel="next">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      ) : (
        <span className={disabled} aria-disabled>
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="size-4" aria-hidden />
        </span>
      )}
    </nav>
  );
}
