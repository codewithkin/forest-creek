"use client";

import { useState } from "react";

import Carousel from "./carousel";
import Lightbox from "./lightbox";

/** A room card's swipeable photos, opening full screen on tap. */
export default function RoomPhotos({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <Carousel
        images={images}
        alt={name}
        rounded="rounded-none"
        className="aspect-[4/3]"
        onExpand={setOpen}
      />
      <Lightbox images={images} alt={name} index={open} onClose={() => setOpen(null)} />
    </>
  );
}
