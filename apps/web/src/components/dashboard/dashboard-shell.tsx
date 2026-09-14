"use client";

import { Building2, CalendarCheck, LayoutGrid, LogOut, MessageSquare, Check, ChevronDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { useProperties } from "./property-context";

// Typed as Route because Link cannot infer its generic from a union of hrefs.
const nav: { href: Route; label: string; icon: typeof LayoutGrid }[] = [
  { href: "/dashboard", label: "Today", icon: LayoutGrid },
  { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/dashboard/chat", label: "Chats", icon: MessageSquare },
  { href: "/dashboard/properties", label: "Properties", icon: Building2 },
];

export default function DashboardShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[15rem_1fr]">
      {/* Desktop rail */}
      <aside className="hidden border-r border-border/60 bg-popover lg:flex lg:flex-col">
        <Link href="/" className="flex items-center gap-2 px-6 py-6 font-display text-xl">
          <img
            src="/brand-icon.png"
            alt=""
            className="h-7 w-7 rounded-md object-cover ring-1 ring-accent/30"
          />
          Forest Creek
        </Link>
        <nav className="flex-1 px-3">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-secondary text-accent"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 px-6 py-5">
          <p className="truncate text-sm">{name}</p>
          <button
            type="button"
            onClick={() =>
              authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })
            }
            className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3 w-3" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md lg:px-8 lg:py-4">
          <PropertySwitcher />
          <button
            type="button"
            onClick={() =>
              authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } })
            }
            aria-label="Sign out"
            className="rounded-full p-2 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* pb leaves room for the mobile tab bar */}
        <main className="min-w-0 flex-1 px-4 pt-5 pb-28 lg:px-8 lg:pt-7 lg:pb-10">{children}</main>
      </div>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/60 bg-popover/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-3 text-[0.7rem] transition-colors ${
                active ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function PropertySwitcher() {
  const { properties, selectedId, selected, select, canSeeAll, isLoading } = useProperties();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return <div className="h-9 w-44 animate-pulse rounded-full bg-secondary" />;
  }

  if (properties.length <= 1) {
    return <p className="truncate font-display text-lg">{properties[0]?.name ?? "No property"}</p>;
  }

  const label = selected?.name ?? "All properties";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex max-w-[70vw] items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-sm hover:border-accent/50"
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-accent" />
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <ul className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
            {canSeeAll && (
              <Option
                label="All properties"
                selected={selectedId === undefined}
                onSelect={() => {
                  select(undefined);
                  setOpen(false);
                }}
              />
            )}
            {properties.map((property) => (
              <Option
                key={property.id}
                label={property.name}
                muted={!property.active}
                selected={selectedId === property.id}
                onSelect={() => {
                  select(property.id);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  muted,
  onSelect,
}: {
  label: string;
  selected: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-secondary/60"
      >
        <span className={muted ? "text-muted-foreground" : ""}>
          {label}
          {muted && " (hidden)"}
        </span>
        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
      </button>
    </li>
  );
}
