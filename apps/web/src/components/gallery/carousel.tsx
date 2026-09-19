"use client";

import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
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
    const thumb = thumbTrack.current?.children[index] as HTMLElement | undefined;
    thumb?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  if (count === 0) {
    return <div className={`bg-secondary ${rounded} ${className}`} aria-hidden />;
  }

  const arrow =
    "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-all hover:bg-background disabled:pointer-events-none disabled:opacity-0";

  return (
    <div className="flex min-h-0 flex-col gap-2">
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
                className={`h-full w-full select-none ${fit === "contain" ? "object-contain" : "object-cover"} ${onExpand ? "cursor-zoom-in" : ""}`}
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
        <div
          ref={thumbTrack}
          className="flex shrink-0 gap-2 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, i) => (
            <button
              key={`${image}-thumb-${i}`}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition-all sm:h-16 sm:w-24 ${
                i === index ? "ring-accent" : "opacity-60 ring-transparent hover:opacity-100"
              }`}
            >
              <img src={mediaUrl(image)} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
