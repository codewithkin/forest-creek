"use client";

import { Expand } from "lucide-react";
import { useState } from "react";

import Lightbox from "@/components/gallery/lightbox";
import Photo from "@/components/media/photo";

export type GalleryPhoto = {
  src: string;
  category: "rooms" | "grounds" | "experiences";
  caption: string;
};

const categories = [
  { id: "all", label: "All photos" },
  { id: "rooms", label: "Rooms" },
  { id: "grounds", label: "Grounds" },
  { id: "experiences", label: "Experiences" },
] as const;

type CategoryId = (typeof categories)[number]["id"];

const VISIBLE = 9;

export default function GalleryGrid({ photos }: { photos: GalleryPhoto[] }) {
  const [category, setCategory] = useState<CategoryId>("all");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const available = categories.filter(
    (entry) => entry.id === "all" || photos.some((photo) => photo.category === entry.id),
  );
  const filtered =
    category === "all" ? photos : photos.filter((photo) => photo.category === category);
  const shown = showAll ? filtered : filtered.slice(0, VISIBLE);

  return (
    <>
      <div
        role="tablist"
        aria-label="Photo categories"
        className="mx-auto mt-10 flex max-w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-card/60 p-1 [scrollbar-width:none] sm:w-fit [&::-webkit-scrollbar]:hidden"
      >
        {available.map((entry) => {
          const active = entry.id === category;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setCategory(entry.id);
                setShowAll(false);
              }}
              className={`shrink-0 rounded-full px-5 py-2 text-sm transition-all duration-300 ${
                active
                  ? "bg-accent text-accent-foreground shadow-md shadow-accent/20"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* Keyed on the category so a switch replays the staggered entrance. */}
      <ul key={category} className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {shown.map((photo, index) => (
          <li
            key={photo.src}
            className="animate-blur-in"
            style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
          >
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Photo
                src={photo.src}
                alt={photo.caption}
                className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-soft)] group-hover:scale-110"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <span className="absolute inset-x-3 bottom-3 flex translate-y-3 items-center justify-between gap-2 text-left opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                <span className="truncate text-sm font-medium text-white">{photo.caption}</span>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm">
                  <Expand className="size-3.5" />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {filtered.length > VISIBLE && (
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="rounded-full border border-border px-6 py-2.5 text-sm transition-colors hover:border-accent/60 hover:text-accent"
          >
            {showAll ? "Show fewer" : `Show all ${filtered.length} photos`}
          </button>
        </div>
      )}

      <Lightbox
        images={shown.map((photo) => photo.src)}
        alt="Forest Creek"
        index={open}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
