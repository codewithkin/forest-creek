"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Mail, ShieldAlert, Undo2, Wallet } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { trpc } from "@/utils/trpc";

const kindMeta = {
  "stuck-payment": { icon: Wallet, label: "Payment stuck" },
  review: { icon: AlertTriangle, label: "Needs review" },
  "refund-due": { icon: Undo2, label: "Refund due" },
  "failed-email": { icon: Mail, label: "Email failed" },
} as const;

function plural(count: number, one: string, many = one + "s") {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * What has gone wrong and needs a person: stuck charges, bookings flagged for
 * review, refunds owed, emails that gave up, Paynow errors, forged callbacks,
 * and Paynow or email not being set up at all. Renders nothing when all is well.
 */
export function AttentionPanel({ propertyId }: { propertyId?: string }) {
  const alerts = useQuery({
    ...trpc.analytics.alerts.queryOptions({ propertyId }),
    refetchInterval: 60_000,
  });
  const data = alerts.data;
  if (!data) return null;

  const { counts, config, items } = data;
  const warnings: string[] = [];
  if (!config.paynow) warnings.push("Paynow is not configured, so guests cannot pay online.");
  if (!config.email) warnings.push("Email is not configured, so guests and staff are not being emailed.");
  if (counts.paynowErrors > 0) {
    warnings.push(`Paynow could not be reached ${plural(counts.paynowErrors, "time")} in the last hour.`);
  }
  if (counts.rejectedCallbacks > 0) {
    warnings.push(
      `${plural(counts.rejectedCallbacks, "payment callback")} with a bad signature ${counts.rejectedCallbacks === 1 ? "was" : "were"} refused in the last day.`,
    );
  }

  if (items.length === 0 && warnings.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-heading"
      className="animate-fade-in rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="attention-heading" className="flex items-center gap-2 font-display text-xl">
          <ShieldAlert aria-hidden className="size-5 text-destructive" />
          Needs attention
        </h2>
        {items.length > 0 && (
          <Link
            href={"/dashboard/bookings?filter=attention" as Route}
            className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
          >
            See all {items.length} <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        )}
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {warnings.map((warning) => (
            <li key={warning} className="flex gap-2 text-destructive">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-border/50">
          {items.slice(0, 5).map((item) => {
            const meta = kindMeta[item.kind];
            const Icon = meta.icon;
            return (
              <li key={`${item.kind}-${item.bookingId}-${item.since}`} className="flex gap-3 py-2.5">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-medium">{meta.label}</span>{" "}
                    <span className="font-mono text-xs tracking-wider text-accent">{item.reference}</span>{" "}
                    <span className="text-muted-foreground">
                      · {item.guestName}
                      {propertyId ? "" : ` · ${item.propertyName}`}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs break-words text-muted-foreground">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
