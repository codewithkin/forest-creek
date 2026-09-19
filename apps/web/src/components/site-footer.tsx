import { ArrowUp, Mail, MapPin, Phone } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { reveal, stagger } from "@/components/motion/reveal";

export const lodge = {
  address: "Vumba Mountains, Mutare, Zimbabwe",
  phone: "+263 71 234 5678",
  email: "reservations@forestcreeklodge.co.zw",
};

const columns: Array<{ title: string; links: Array<{ href: Route; label: string }> }> = [
  {
    title: "Stay",
    links: [
      { href: "/places" as Route, label: "Our places" },
      { href: "/book" as Route, label: "Book a stay" },
      { href: "/#gallery" as Route, label: "Gallery" },
    ],
  },
  {
    title: "The lodge",
    links: [
      { href: "/#story" as Route, label: "Our story" },
      { href: "/#places" as Route, label: "Featured houses" },
      { href: "/login" as Route, label: "Staff sign in" },
    ],
  },
];

/**
 * A floating card on a softer panel, with the lodge's name set huge and
 * outlined beneath it, rising into view as the page ends.
 */
export default function SiteFooter() {
  const contacts = [
    { icon: Phone, href: `tel:${lodge.phone.replace(/\s/g, "")}`, label: lodge.phone },
    { icon: Mail, href: `mailto:${lodge.email}`, label: lodge.email },
  ];

  return (
    <footer className="px-3 pt-3 pb-3 sm:px-5">
      <div className="relative mx-auto max-w-[88rem] overflow-hidden rounded-[2rem] border border-border/50 bg-popover px-3 pt-10 sm:rounded-[2.5rem] sm:px-8 sm:pt-16">
        <div
          {...reveal("up")}
          className="relative z-10 mx-auto max-w-6xl rounded-3xl border border-border/70 bg-card/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-10"
        >
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <Link href="/" className="group inline-flex items-center gap-3">
                <img
                  src="/brand-icon.png"
                  alt=""
                  className="size-11 rounded-2xl object-cover ring-1 ring-accent/30 transition-transform duration-500 group-hover:rotate-[-8deg]"
                />
                <span className="font-display text-2xl font-semibold">Forest Creek</span>
              </Link>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                An eco-conscious retreat in the Vumba highlands — every stay planted lightly among
                the trees, and looked after by hand.
              </p>
              <p className="mt-5 inline-flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                {lodge.address}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {contacts.map((contact) => (
                  <a
                    key={contact.href}
                    href={contact.href}
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 px-3.5 py-2 text-xs text-muted-foreground transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/60 hover:text-accent"
                  >
                    <contact.icon className="size-3.5 shrink-0" />
                    <span className="truncate">{contact.label}</span>
                  </a>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 lg:col-span-6 lg:justify-items-end">
              {columns.map((column, index) => (
                <div key={column.title} {...reveal("up", stagger(index + 1, 100))}>
                  <h2 className="text-sm font-medium">{column.title}</h2>
                  <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="group inline-flex items-center gap-1 transition-colors hover:text-accent"
                        >
                          <span className="h-px w-0 bg-accent transition-all duration-300 group-hover:w-3" />
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              &copy; {new Date().getFullYear()} Forest Creek Lodge, Vumba. Managed with care by
              Thembie &amp; Michaels.
            </p>
            <a
              href="#top"
              className="group inline-flex items-center gap-2 self-start underline-offset-4 hover:text-accent hover:underline sm:self-auto"
            >
              Back to top
              <ArrowUp className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5" />
            </a>
          </div>
        </div>

        <p
          {...reveal("up", 150)}
          aria-hidden
          className="watermark pointer-events-none -mt-6 text-center font-display text-[15vw] leading-[0.8] font-semibold tracking-tight whitespace-nowrap select-none sm:-mt-10 xl:text-[17rem]"
        >
          Forest Creek
        </p>
      </div>
    </footer>
  );
}
