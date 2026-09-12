"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { mediaUrl } from "@/lib/server-url";

const sections = [
  { href: "/#rooms", label: "Rooms" },
  { href: "/#activities", label: "Activities" },
  { href: "/#story", label: "Our Story" },
  { href: "/#gallery", label: "Gallery" },
];

export default function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <img
            src={mediaUrl("/media/logo.webp")}
            alt=""
            className="h-10 w-10 rounded-full object-cover ring-1 ring-accent/30"
          />
          <span className="font-display text-xl font-semibold tracking-wide sm:text-2xl">
            Forest Creek Lodge
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="text-sm text-muted-foreground transition-colors hover:text-accent"
            >
              {section.label}
            </a>
          ))}
          <Link
            href="/book"
            className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Book Your Stay
          </Link>
        </nav>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded-full p-2 text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-border/60 px-5 pb-5 md:hidden">
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              onClick={() => setOpen(false)}
              className="block py-3 text-muted-foreground transition-colors hover:text-accent"
            >
              {section.label}
            </a>
          ))}
          <Link
            href="/book"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-full bg-accent px-5 py-3 text-center font-medium text-accent-foreground"
          >
            Book Your Stay
          </Link>
        </nav>
      )}
    </header>
  );
}
