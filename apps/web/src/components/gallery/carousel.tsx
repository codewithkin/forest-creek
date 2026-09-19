"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Expand } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { mediaUrl } from "@/lib/server-url";

/**
 * A swipeable photo strip. Scrolling is native CSS scroll-snap, so touch swipe,
 * trackpad and momentum all behave like the platform; the arrows, dots and
 * arrow keys just scroll the same strip.
 */
export default function Carousel({
  images,
  alt,
  className = "",
  rounded = "rounded-2xl",
  startIndex = 0,
  thumbnails = false,
  fit = "cover",
  onIndexChange,
  onExpand,
  autoFocus = false,
  thumbnailSide = "bottom",
}: {
  images: string[];
  alt: string;
  className?: string;
  rounded?: string;
  startIndex?: number;
  thumbnails?: boolean;
  fit?: "cover" | "contain";
  onIndexChange?: (index: number) => void;
  /** Shows an expand button (and makes a photo click open it), e.g. a lightbox. */
  onExpand?: (index: number) => void;
  /** Take focus on mount so arrow keys work straight away (the lightbox). */
  autoFocus?: boolean;
  /** "left" stacks the thumbnails in a vertical rail beside the photo on large screens. */
  thumbnailSide?: "bottom" | "left";
}) {
  const track = useRef<HTMLDivElement>(null);
  const thumbTrack = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(startIndex);
  const count = images.length;

  const goTo = useCallback((target: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(target, el.children.length - 1));
    el.scrollTo({ left: next * el.clientWidth, behavior: smooth ? "smooth" : "instant" });
  }, []);

  // Open on the requested photo without an animated sweep past the others.
  useEffect(() => {
    goTo(startIndex, false);
  }, [goTo, startIndex]);

  function onScroll() {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const current = Math.round(el.scrollLeft / el.clientWidth);
    if (current !== index) {
      setIndex(current);
      onIndexChange?.(current);
    }
  }

  // Keep the active thumbnail in view as the main strip moves.
  useEffect(() => {
    // Scroll the rail itself — scrollIntoView would also drag the page along.
    const rail = thumbTrack.current;
    const thumb = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !thumb) return;
    rail.scrollTo({
      left: thumb.offsetLeft - (rail.clientWidth - thumb.clientWidth) / 2,
      top: thumb.offsetTop - (rail.clientHeight - thumb.clientHeight) / 2,
      behavior: "smooth",
    });
  }, [index]);

  if (count === 0) {
    return <div className={`bg-secondary ${rounded} ${className}`} aria-hidden />;
  }

  const arrow =
    "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-all hover:bg-background disabled:pointer-events-none disabled:opacity-0";

  const side = thumbnails && thumbnailSide === "left";

  return (
    <div className={`flex min-h-0 flex-col gap-2 ${side ? "lg:flex-row-reverse lg:gap-4" : ""}`}>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={alt}
        tabIndex={0}
        autoFocus={autoFocus}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            goTo(index + 1);
          } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            goTo(index - 1);
          }
        }}
        className={`group/carousel relative overflow-hidden outline-none ${fit === "cover" ? "bg-secondary" : ""} focus-visible:ring-2 focus-visible:ring-ring ${rounded} ${className}`}
      >
        <div
          ref={track}
          onScroll={onScroll}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, i) => (
            <div
              key={`${image}-${i}`}
              className="relative h-full w-full shrink-0 snap-center snap-always"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
            >
              <img
                src={mediaUrl(image)}
                alt={count > 1 ? `${alt} — photo ${i + 1} of ${count}` : alt}
                loading={i === startIndex ? "eager" : "lazy"}
                draggable={false}
                onClick={onExpand ? () => onExpand(i) : undefined}
                className={`h-full w-full select-none transition-all duration-700 ease-[var(--ease-soft)] ${fit === "contain" ? "object-contain" : "object-cover"} ${onExpand ? "cursor-zoom-in" : ""} ${i === index ? "scale-100 opacity-100" : "scale-[0.96] opacity-60"}`}
              />
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className={`${arrow} left-3 sm:opacity-0 sm:group-hover/carousel:opacity-100 sm:group-focus-within/carousel:opacity-100`}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              disabled={index === count - 1}
              onClick={() => goTo(index + 1)}
              className={`${arrow} right-3 sm:opacity-0 sm:group-hover/carousel:opacity-100 sm:group-focus-within/carousel:opacity-100`}
            >
              <ChevronRight className="size-4" />
            </button>

            {!thumbnails && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
                {images.slice(0, 10).map((image, i) => (
                  <span
                    key={`${image}-dot-${i}`}
                    className={`h-1.5 rounded-full bg-white shadow transition-all duration-300 ${
                      i === index ? "w-4 opacity-100" : "w-1.5 opacity-60"
                    }`}
                  />
                ))}
              </div>
            )}

            <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium tabular-nums backdrop-blur-sm">
              {index + 1} / {count}
            </span>
          </>
        )}

        {onExpand && (
          <button
            type="button"
            aria-label="View photos full screen"
            onClick={() => onExpand(index)}
            className="absolute right-3 bottom-3 flex size-8 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm transition-colors hover:bg-background"
          >
            <Expand className="size-3.5" />
          </button>
        )}
      </div>

      {thumbnails && count > 1 && (
        <div className={`relative shrink-0 ${side ? "lg:w-24" : ""}`}>
          {side && (
            <button
              type="button"
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className="absolute -top-1 left-1/2 z-10 hidden size-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background shadow transition-colors hover:text-accent disabled:opacity-30 lg:flex"
            >
              <ChevronUp className="size-3.5" />
            </button>
          )}
          <div
            ref={thumbTrack}
            className={`flex gap-2 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              side ? "lg:absolute lg:inset-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:py-7" : ""
            }`}
          >
            {images.map((image, i) => (
              <button
                key={`${image}-thumb-${i}`}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-background transition-all duration-300 sm:h-16 sm:w-24 ${
                  side ? "lg:h-24 lg:w-full" : ""
                } ${i === index ? "ring-accent" : "opacity-55 ring-transparent hover:opacity-100"}`}
              >
                <img
                  src={mediaUrl(image)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-110"
                />
              </button>
            ))}
          </div>
          {side && (
            <button
              type="button"
              aria-label="Next photo"
              disabled={index === count - 1}
              onClick={() => goTo(index + 1)}
              className="absolute -bottom-1 left-1/2 z-10 hidden size-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background shadow transition-colors hover:text-accent disabled:opacity-30 lg:flex"
            >
              <ChevronDown className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
