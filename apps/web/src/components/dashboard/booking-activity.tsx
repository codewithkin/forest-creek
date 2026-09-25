"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Mail, RefreshCw, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError, Skeleton } from "@/components/brand/state";
import { ReceiptRows } from "@/components/booking/receipt-list";
import { trpc } from "@/utils/trpc";

type BookingLike = {
  id: string;
  reference: string;
  paymentStatus: string;
  bookingStatus: string;
  paynowPollUrl: string | null;
  paynowReference: string | null;
  paynowStatus: string | null;
  paymentRequestedAt: string | null;
};

type Tone = { label: string; className: string };

const emailTones: Record<string, Tone> = {
  sent: { label: "Sent", className: "bg-emerald-500/10 text-emerald-300" },
  pending: { label: "Queued", className: "bg-secondary text-muted-foreground" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  skipped: { label: "Not sent", className: "bg-secondary text-muted-foreground/70" },
};

const eventLabels: Record<string, string> = {
  created: "Booking received",
  confirmed: "Payment confirmed",
  cancelled: "Cancelled",
  expired: "Hold expired",
  review: "Needs review",
  "paid-in-full": "Paid in full",
  "balance-reminder": "Balance reminder",
  amended: "Dates changed",
  refunded: "Refund sent",
  "refund-declined": "No refund",
  credit: "Credit issued",
};

// What each logged Paynow event meant, in staff words.
const outcomeLabels: Record<string, string> = {
  confirmed: "confirmed the booking",
  "already-paid": "already paid — nothing changed",
  "status-recorded": "status noted",
  "amount-mismatch": "wrong amount — sent for review",
  "poll-url-mismatch": "for another transaction — ignored",
  "unknown-booking": "unknown booking — ignored",
  "no-payment-started": "no payment started — ignored",
  error: "could not reach Paynow",
  recorded: "recorded by staff",
  rejected: "bad signature — refused",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * What happened behind a booking: where its Paynow charge stands, and every
 * email it sent. Collapsed by default and loaded on open, so the list stays
 * one query however many bookings are on screen.
 */
export function BookingActivity({ booking }: { booking: BookingLike }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const emails = useQuery({
    ...trpc.bookings.notifications.queryOptions(booking.id),
    enabled: open,
  });

  const events = useQuery({
    ...trpc.bookings.paymentEvents.queryOptions(booking.id),
    enabled: open,
  });

  const receipts = useQuery({
    ...trpc.receipts.forBooking.queryOptions(booking.id),
    enabled: open,
  });

  const retry = useMutation(
    trpc.bookings.retryNotification.mutationOptions({
      onSuccess: async () => {
        toast.success("Queued again — it will go out within a minute");
        await queryClient.invalidateQueries({
          queryKey: trpc.bookings.notifications.queryKey(booking.id),
        });
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const reconcile = useMutation(
    trpc.bookings.reconcile.mutationOptions({
      onSuccess: async (result) => {
        if (!result?.ok) {
          toast.error(result?.error ?? "Paynow could not be reached");
        } else if (result.paid) {
          toast.success(`Paynow confirms it — ${booking.reference} is paid`);
        } else {
          toast.message("Paynow has not received this payment yet");
        }
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  // Worth asking Paynow only while a charge exists and nobody has settled it.
  const canReconcile =
    Boolean(booking.paynowPollUrl) &&
    booking.paymentStatus !== "verified" &&
    booking.bookingStatus !== "cancelled";

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          aria-hidden
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
        Payment &amp; emails
      </button>

      {open && (
        <div className="mt-3 space-y-4 rounded-lg border border-border/60 p-3 text-sm animate-fade-in">
          <section>
            <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Paynow</h3>
            {booking.paynowPollUrl || booking.paynowStatus ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Last status</dt>
                <dd>{booking.paynowStatus ?? "not reported yet"}</dd>
                {booking.paynowReference && (
                  <>
                    <dt className="text-muted-foreground">Paynow ref</dt>
                    <dd className="font-mono">{booking.paynowReference}</dd>
                  </>
                )}
                {booking.paymentRequestedAt && (
                  <>
                    <dt className="text-muted-foreground">Charge started</dt>
                    <dd>{when(booking.paymentRequestedAt)}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No payment has been started yet.</p>
            )}
            {events.data && events.data.length > 0 && (
              <ol className="mt-3 space-y-1 border-l border-border/60 pl-3 text-xs">
                {events.data.map((event) => (
                  <li key={event.id} className="text-muted-foreground">
                    <span className="text-foreground">{when(event.createdAt)}</span> ·{" "}
                    {event.source === "callback"
                      ? "Paynow notified us"
                      : event.source === "manual"
                        ? `Payment of $${event.amount ?? "?"} (${event.detail ?? "manual"})`
                        : "We asked Paynow"}
                    {event.status ? ` (${event.status})` : ""} —{" "}
                    {outcomeLabels[event.outcome] ?? event.outcome}
                    {event.detail && event.outcome === "error" ? `: ${event.detail}` : ""}
                  </li>
                ))}
              </ol>
            )}
            {canReconcile && (
              <button
                type="button"
                disabled={reconcile.isPending}
                onClick={() => reconcile.mutate(booking.id)}
                className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
              >
                {reconcile.isPending ? <Spinner /> : <RefreshCw aria-hidden />}
                Re-check with Paynow
              </button>
            )}
          </section>

          <section>
            <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Receipts</h3>
            {receipts.isPending && <Skeleton className="mt-2 h-10 w-full" />}
            {receipts.isError && (
              <p className="mt-2 text-xs text-destructive">{friendlyError(receipts.error)}</p>
            )}
            {receipts.data?.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                None yet — one is issued with every payment received.
              </p>
            )}
            {receipts.data && receipts.data.length > 0 && (
              <div className="mt-2">
                <ReceiptRows receipts={receipts.data} compact copyable />
              </div>
            )}
          </section>

          <section>
            <h3 className="text-xs tracking-wide text-muted-foreground uppercase">Emails</h3>
            {emails.isPending && <Skeleton className="mt-2 h-10 w-full" />}
            {emails.isError && (
              <p className="mt-2 text-xs text-destructive">{friendlyError(emails.error)}</p>
            )}
            {emails.data?.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">No emails for this booking.</p>
            )}
            <ul className="mt-2 space-y-2">
              {emails.data?.map((email) => {
                const tone =
                  email.status === "pending" && email.attempts > 0
                    ? { label: `Retrying (${email.attempts} tries)`, className: "bg-accent/10 text-accent" }
                    : emailTones[email.status];
                const retrying = retry.isPending && retry.variables === email.id;
                return (
                  <li key={email.id} className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs">
                        <Mail aria-hidden className="size-3.5 text-muted-foreground" />
                        {eventLabels[email.event.split(":")[0]!] ?? email.event} ·{" "}
                        {email.audience === "guest" ? "guest" : "staff"}
                        {tone && (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone.className}`}>
                            {tone.label}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs break-all text-muted-foreground">
                        {email.recipient}
                        {email.sentAt ? ` · ${when(email.sentAt)}` : ""}
                      </p>
                      {email.lastError && email.status !== "sent" && (
                        <p className="mt-0.5 text-xs text-muted-foreground/80">{email.lastError}</p>
                      )}
                    </div>
                    {(email.status === "failed" || email.status === "skipped") && (
                      <button
                        type="button"
                        disabled={retrying}
                        onClick={() => retry.mutate(email.id)}
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        {retrying ? <Spinner /> : <RotateCcw aria-hidden />}
                        Retry
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
