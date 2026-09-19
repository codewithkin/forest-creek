"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const sections: Array<{ href: Route; label: string; match: (path: string) => boolean }> = [
  { href: "/" as Route, label: "Home", match: (path) => path === "/" },
  { href: "/places" as Route, label: "Places", match: (path) => path.startsWith("/places") },
  { href: "/#story" as Route, label: "Our Story", match: () => false },
  { href: "/#gallery" as Route, label: "Gallery", match: () => false },
];

/**
 * A floating pill that sits over the page. It tightens and turns opaque once
 * the guest scrolls, and on phones opens into a sheet that drops from it.
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the sheet on navigation, and keep the page still while it's open.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={`pointer-events-auto mx-auto flex max-w-6xl animate-fade-up items-center justify-between gap-4 rounded-full border pl-2 transition-all duration-500 ease-[var(--ease-soft)] ${
          scrolled || open
            ? "border-border/80 bg-background/85 py-1.5 pr-1.5 shadow-xl shadow-black/25 backdrop-blur-xl"
            : "border-border/40 bg-background/40 py-2 pr-2 backdrop-blur-md"
        }`}
      >
        <Link href="/" className="group flex items-center gap-2.5 rounded-full pr-2">
          <img
            src="/brand-icon.png"
            alt=""
            className="size-9 rounded-full object-cover ring-1 ring-accent/30 transition-transform duration-500 group-hover:rotate-[-8deg] sm:size-10"
          />
          <span className="font-display text-lg font-semibold tracking-wide sm:text-xl">
            Forest Creek
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full bg-secondary/40 p-1 md:flex">
          {sections.map((section) => {
            const active = section.match(pathname);
            return (
              <Link
                key={section.href}
                href={section.href}
                className={`relative rounded-full px-4 py-1.5 text-sm transition-colors duration-300 ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/book"
            className="group relative hidden items-center gap-2 overflow-hidden rounded-full bg-accent py-1.5 pr-1.5 pl-5 text-sm font-medium text-accent-foreground shadow-lg shadow-accent/20 transition-transform duration-300 hover:-translate-y-0.5 sm:inline-flex"
          >
            <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-shine bg-white/30 blur-md" />
            Book your stay
            <span className="flex size-7 items-center justify-center rounded-full bg-accent-foreground text-accent transition-transform duration-500 group-hover:-rotate-45">
              <ArrowRight className="size-3.5" />
            </span>
          </Link>

          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex size-10 items-center justify-center rounded-full bg-secondary/70 text-foreground transition-colors hover:bg-secondary md:hidden"
          >
            <span className="relative size-5">
              <Menu
                className={`absolute inset-0 size-5 transition-all duration-300 ${open ? "scale-50 rotate-90 opacity-0" : ""}`}
              />
              <X
                className={`absolute inset-0 size-5 transition-all duration-300 ${open ? "" : "scale-50 -rotate-90 opacity-0"}`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* Phone sheet */}
      <div
        className={`pointer-events-auto mx-auto mt-2 max-w-6xl origin-top overflow-hidden rounded-3xl border border-border/80 bg-background/95 shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-500 ease-[var(--ease-soft)] md:hidden ${
          open ? "max-h-[80svh] scale-100 opacity-100" : "pointer-events-none max-h-0 scale-95 opacity-0"
        }`}
      >
        <nav className="flex flex-col p-3">
          {sections.map((section, index) => (
            <Link
              key={section.href}
              href={section.href}
              onClick={() => setOpen(false)}
              style={{ transitionDelay: open ? `${80 + index * 60}ms` : "0ms" }}
              className={`flex items-center justify-between rounded-2xl px-4 py-3.5 font-display text-2xl transition-all duration-500 hover:bg-secondary ${
                open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
              } ${section.match(pathname) ? "text-accent" : ""}`}
            >
              {section.label}
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          <Link
            href="/book"
            onClick={() => setOpen(false)}
            className="mt-2 flex items-center justify-between rounded-2xl bg-accent px-5 py-4 font-medium text-accent-foreground"
          >
            Book your stay
            <span className="flex size-8 items-center justify-center rounded-full bg-accent-foreground text-accent">
              <ArrowRight className="size-4" />
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
