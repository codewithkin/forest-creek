"use client";

import { useEffect } from "react";

/**
 * A bar stuck to the bottom of the screen (the booking page's Back / Continue)
 * lifts the "Ask the Guide" launcher and the open chat above itself, so the
 * two never sit on top of each other. The bar's height lands in the CSS
 * variable --chat-lift for as long as it is on the page.
 */
export function useChatLift(bar: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--chat-lift", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--chat-lift");
    };
  }, [bar]);
}
