import type { CSSProperties } from "react";

export type RevealKind = "up" | "down" | "left" | "right" | "zoom" | "blur" | "curtain";

/**
 * Props that make any element fade in as it scrolls into view. Spread onto a
 * plain element — no client component needed:
 *
 *   <div {...reveal("up", 120)}>…</div>
 */
export function reveal(kind: RevealKind = "up", delayMs = 0) {
  return {
    "data-reveal": kind,
    style: { "--reveal-delay": `${delayMs}ms` } as CSSProperties,
  };
}

/** Delay for the n-th item of a list, capped so long lists don't lag. */
export function stagger(index: number, stepMs = 90, maxMs = 540): number {
  return Math.min(index * stepMs, maxMs);
}
