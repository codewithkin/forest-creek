"use client";

import type { ImgHTMLAttributes } from "react";
import { useState } from "react";

import { mediaUrl } from "@/lib/server-url";

/** Drawn on the brand green, so a missing file reads as a frame, never a hole. */
const FALLBACK = "/images/photo-missing.svg";

type PhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
};

/**
 * Every photograph on the guest site goes through here. It resolves the path
 * (API `/media/...` or an absolute R2 URL), tints the box while the bytes are
 * in flight, and swaps in a placeholder when the file 404s or the row holds a
 * broken URL — an empty area with nothing in it is what guests reported.
 */
export default function Photo({ src, alt = "", className = "", ...rest }: PhotoProps) {
  const [failed, setFailed] = useState(false);
  const resolved = src ? mediaUrl(src) : "";

  return (
    <img
      src={failed || !resolved ? FALLBACK : resolved}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-secondary/50 ${className}`}
      {...rest}
    />
  );
}
