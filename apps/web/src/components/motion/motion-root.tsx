"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Drives every scroll reveal on the site with ONE IntersectionObserver.
 * Sections stay server components: they only carry a `data-reveal` attribute
 * (see reveal()), and this watches the DOM for them — including ones that
 * arrive later through client navigation or a re-rendered result list.
 */
export default function MotionRoot() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.classList.add("motion-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-shown", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    const watch = (scope: ParentNode) => {
      for (const el of scope.querySelectorAll("[data-reveal]:not([data-shown])")) {
        observer.observe(el);
      }
    };
    watch(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches("[data-reveal]:not([data-shown])")) observer.observe(node);
          watch(node);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  return null;
}
