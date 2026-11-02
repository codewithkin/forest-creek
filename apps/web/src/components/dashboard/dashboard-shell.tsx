"use client";

import {
  Building2,
  CalendarCheck,
  CalendarRange,
  Check,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderOpen,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquare,
  Receipt,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import { useProperties } from "./property-context";

type NavItem = { href: Route; label: string; icon: typeof LayoutGrid };

// Typed as Route because Link cannot infer its generic from a union of hrefs.
// Cast because typed routes only learn a new folder once next build (or a
// dev restart that actually compiles it) has run — see apps/web/AGENTS.md.
const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Today", icon: LayoutGrid },
      { href: "/dashboard/reports" as Route, label: "Reports", icon: ClipboardList },
      { href: "/dashboard/trends" as Route, label: "Trends", icon: TrendingUp },
    ],
  },
  {
    title: "Bookings",
    items: [
      { href: "/dashboard/bookings", label: "Bookings", icon: CalendarCheck },
      { href: "/dashboard/availability" as Route, label: "Availability", icon: CalendarRange },
      { href: "/dashboard/quotations" as Route, label: "Quotations", icon: FileText },
      { href: "/dashboard/invoices" as Route, label: "Invoices", icon: Receipt },
      { href: "/dashboard/day-visits" as Route, label: "Day visits", icon: Sun },
      { href: "/dashboard/chat", label: "Chats", icon: MessageSquare },
    ],
  },
  {
    title: "Manage",
    items: [
      { href: "/dashboard/properties", label: "Properties", icon: Building2 },
      { href: "/dashboard/files" as Route, label: "Files", icon: FolderOpen },
    ],
  },
];

const allItems = groups.flatMap((group) => group.items);
/** The phone's tab bar has room for four; the rest live behind More. */
const TAB_HREFS = ["/dashboard", "/dashboard/bookings", "/dashboard/availability", "/dashboard/chat"];
const tabs = allItems.filter((item) => TAB_HREFS.includes(item.href));
const more = allItems.filter((item) => !TAB_HREFS.includes(item.href));

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/login") } });

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-border/60 bg-popover lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-6 py-6 font-display text-xl">
          <img
            src="/brand-icon.png"
            alt=""
            className="h-8 w-8 rounded-lg object-cover ring-1 ring-accent/30"
          />
          Forest Creek
        </Link>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-2 text-[0.65rem] tracking-[0.18em] text-muted-foreground uppercase">{group.title}</p>
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`mb-0.5 flex items-center gap-3 rounded-full px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="m-3 flex items-center gap-3 rounded-2xl bg-secondary/60 px-3 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-accent">
            {name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm">{name}</p>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-4 py-3 backdrop-blur-md lg:px-8 lg:py-4">
          <PropertySwitcher />
          <button
            type="button"
            onClick={signOut}
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
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border/60 bg-popover/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {tabs.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 py-3 text-center text-[0.65rem] leading-tight transition-colors ${
                active ? "text-accent" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`flex flex-col items-center gap-1 py-3 text-center text-[0.65rem] leading-tight transition-colors ${
            more.some((item) => isActive(pathname, item.href)) ? "text-accent" : "text-muted-foreground"
          }`}
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Everything the tab bar has no room for */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)} className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border/70 bg-popover p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-lg">More</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="rounded-full p-2 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {more.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3 text-sm ${
                    isActive(pathname, item.href) ? "text-accent" : ""
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
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
