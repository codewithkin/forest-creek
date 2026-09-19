"use client";

import { Images } from "lucide-react";
import { useState } from "react";

import { mediaUrl } from "@/lib/server-url";

import Carousel from "./carousel";
import Lightbox from "./lightbox";

/**
 * Desktop: one large photo beside a 2x2 grid, the last tile offering the rest.
 * Phones: a swipeable strip. Either opens the full-screen viewer.
 */
export default function PropertyGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;

  const [lead, ...rest] = images;
  const tiles = rest.slice(0, 4);
  const hidden = images.length - 1 - tiles.length;

  return (
    <>
      <div className="md:hidden">
        <Carousel images={images} alt={name} className="aspect-[4/3]" onExpand={setOpen} />
      </div>

      <div
        className={`hidden gap-3 md:grid md:h-[30rem] ${
          tiles.length === 0 ? "grid-cols-1" : "grid-cols-2"
        }`}
      >
        <Tile image={lead ?? ""} alt={`${name} — photo 1`} onClick={() => setOpen(0)} />
        {tiles.length > 0 && (
          <div className={`grid gap-3 ${tiles.length > 1 ? "grid-cols-2" : ""} ${tiles.length > 2 ? "grid-rows-2" : ""}`}>
            {tiles.map((image, i) => {
              const isLast = i === tiles.length - 1;
              return (
                <Tile
                  key={`${image}-${i}`}
                  image={image}
                  alt={`${name} — photo ${i + 2}`}
                  onClick={() => setOpen(i + 1)}
                  // Three tiles leave a gap in a 2x2 grid; the first one spans it.
                  className={tiles.length === 3 && i === 0 ? "col-span-2" : ""}
                  overlay={
                    isLast ? (
                      <span className="absolute inset-0 flex items-center justify-center gap-2 bg-background/55 font-medium opacity-100 backdrop-blur-[2px] transition-colors group-hover:bg-background/40">
                        <Images className="size-4" aria-hidden />
                        {hidden > 0 ? `+${hidden} more` : "Show all photos"}
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      <Lightbox images={images} alt={name} index={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Tile({
  image,
  alt,
  onClick,
  overlay,
  className = "",
}: {
  image: string;
  alt: string;
  onClick: () => void;
  overlay?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-border/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className}`}
    >
      <img
        src={mediaUrl(image)}
        alt={alt}
        loading="lazy"
        className="h-full w-full cursor-zoom-in object-cover transition-transform duration-700 group-hover:scale-105"
      />
      {overlay}
    </button>
  );
}
