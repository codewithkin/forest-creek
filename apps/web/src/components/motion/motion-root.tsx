"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Extra sweeps, after fonts and photographs have settled the layout. */
const SETTLE_MS = [400, 1200, 3000];

/**
 * Drives every scroll reveal on the site with ONE IntersectionObserver.
 * Sections stay server components: they only carry a `data-reveal` attribute
 * (see reveal()), and this watches the DOM for them — including ones that
 * arrive later through client navigation or a re-rendered result list.
 *
 * The observer is the fast path, not the only one. A reveal that never fires
 * leaves a photograph permanently invisible, which is what guests saw as empty
 * boxes on Android and desktop, so a plain rect sweep runs alongside it — on
 * scroll, on resize, whenever a photo finishes loading, and a few times while
 * the layout settles. The page can only ever end up MORE visible, never less.
 */
export default function MotionRoot() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("motion-ready");

    const show = (el: Element) => {
      el.setAttribute("data-shown", "");
      observer.unobserve(el);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) show(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    const hidden = () => document.querySelectorAll("[data-reveal]:not([data-shown])");

    /** Reveals anything whose top edge has reached the viewport, observer or not. */
    let queued = false;
    const sweep = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const limit = window.innerHeight;
        for (const el of hidden()) {
          if (el.getBoundingClientRect().top < limit) show(el);
        }
      });
    };

    const watch = (scope: ParentNode) => {
      for (const el of scope.querySelectorAll("[data-reveal]:not([data-shown])")) {
        observer.observe(el);
      }
    };
    watch(document);
    sweep();

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-reveal]:not([data-shown])")) observer.observe(node);
          watch(node);
        }
      }
      sweep();
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("resize", sweep);
    // A photo finishing late reflows everything under it.
    window.addEventListener("load", sweep);
    document.addEventListener("load", sweep, true);

    const settle = SETTLE_MS.map((ms) => window.setTimeout(sweep, ms));

    return () => {
      for (const timer of settle) window.clearTimeout(timer);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", sweep);
      window.removeEventListener("resize", sweep);
      window.removeEventListener("load", sweep);
      document.removeEventListener("load", sweep, true);
    };
  }, [pathname]);

  return null;
}
