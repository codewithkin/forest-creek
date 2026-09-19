"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import Carousel from "./carousel";

/**
 * Full-screen photo viewer on a native <dialog>: Escape closes it, focus is
 * trapped and restored by the browser, and the page behind stops scrolling.
 */
export default function Lightbox({
  images,
  alt,
  index,
  onClose,
}: {
  images: string[];
  alt: string;
  /** The photo to open on; null keeps the viewer closed. */
  index: number | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const open = index !== null;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && el.open) {
      el.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label={`${alt} photos`}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog itself, not its content) closes.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-foreground backdrop:bg-black/80"
    >
      {open && (
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 px-3 pt-14 pb-4 sm:px-6">
          <button
            type="button"
            aria-label="Close photos"
            onClick={onClose}
            className="absolute top-3 right-3 z-20 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="size-5" />
          </button>
          <p className="absolute top-5 left-4 text-sm text-white/70 sm:left-6">{alt}</p>
          <div className="min-h-0 flex-1">
            <Carousel
              images={images}
              alt={alt}
              startIndex={index}
              thumbnails
              autoFocus
              fit="contain"
              rounded="rounded-xl"
              className="h-[calc(100dvh-10rem)]"
            />
          </div>
        </div>
      )}
    </dialog>
  );
}
