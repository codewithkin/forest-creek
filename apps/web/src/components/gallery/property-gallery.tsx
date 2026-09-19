"use client";

import { useState } from "react";

import Carousel from "./carousel";
import Lightbox from "./lightbox";

/**
 * A product-page style viewer: a vertical thumbnail rail beside one large,
 * swipeable photo on desktop, thumbnails underneath on phones. Any photo
 * opens the full-screen viewer.
 */
export default function PropertyGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;

  return (
    <>
      <Carousel
        images={images}
        alt={name}
        thumbnails
        thumbnailSide="left"
        rounded="rounded-3xl"
        className="aspect-[4/3] border border-border/60 sm:aspect-[16/10] lg:min-w-0 lg:flex-1"
        onExpand={setOpen}
      />
      <Lightbox images={images} alt={name} index={open} onClose={() => setOpen(null)} />
    </>
  );
}
