"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

const links = [
  { href: "/dashboard", label: "Bookings" },
  { href: "/dashboard/chat", label: "Guest chats" },
] as const;

export default function DashboardNav({ name }: { name: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-border/60 bg-popover">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-display text-xl">
            Forest Creek
          </Link>
          <nav className="flex gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm transition-colors ${
                  pathname === link.href
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{name}</span>
          <button
            type="button"
            onClick={() =>
              authClient.signOut({
                fetchOptions: { onSuccess: () => router.push("/login") },
              })
            }
            className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-accent/50"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
