"use client";

import type { ImgHTMLAttributes } from "react";
import { useCallback, useState } from "react";

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

  /*
   * onError alone is not enough. The markup is server-rendered, so a photo can
   * finish failing before React hydrates, and the event that would have set
   * the state is long gone — the guest is left looking at a broken-image icon
   * and some alt text. A complete image with no intrinsic width has failed.
   */
  const check = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <img
      ref={check}
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
