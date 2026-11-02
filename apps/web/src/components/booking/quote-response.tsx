"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

type Line = {
  id: string;
  kind: string;
  description: string;
  checkIn: string | null;
  checkOut: string | null;
  guests: number | null;
  unitPrice: number;
  quantity: number;
  amount: number;
};

type Quote = {
  id: string;
  label: string;
  status: string;
  guestName: string;
  company: string | null;
  validUntil: string;
  notes: string | null;
  subtotal: number;
  discount: number;
  discountNote: string | null;
  total: number;
  lines: Line[];
  property: { name: string; phone: string; email: string };
  bookings: { id: string; reference: string; roomName: string; totalAmount: number; depositAmount: number; amountPaid: number; paymentStatus: string }[];
};

function formatDay(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const CLOSED_MESSAGE: Record<string, string> = {
  expired: "This quotation has expired.",
  cancelled: "This quotation has been withdrawn.",
};

/** The guest's quotation: read it, accept or decline it, then pay. */
export default function QuoteResponse({ quote: initial }: { quote: Quote }) {
  const view = useQuery({ ...trpc.quotes.view.queryOptions(initial.id), initialData: initial as never });
  const quote = (view.data ?? initial) as Quote;
  const [policy, setPolicy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const markViewed = useMutation(trpc.quotes.markViewed.mutationOptions());
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    markViewed.mutate({ id: initial.id });
  }, [initial.id, markViewed]);

  const accept = useMutation(trpc.quotes.accept.mutationOptions({ onSuccess: () => void view.refetch() }));
  const decline = useMutation(trpc.quotes.decline.mutationOptions({ onSuccess: () => void view.refetch() }));

  const open = quote.status === "sent" || quote.status === "viewed";
  const busy = accept.isPending || decline.isPending;

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Prepared for <span className="text-foreground">{quote.guestName}</span>
        {quote.company ? `, ${quote.company}` : ""} by {quote.property.name}.
        {open && ` Valid until ${formatDay(quote.validUntil)}.`}
      </p>

      <div className="rounded-3xl border border-border/70 bg-card p-6">
        <ul className="divide-y divide-border/50">
          {quote.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4 py-3 first:pt-0">
              <div className="min-w-0">
                <p className="font-medium">{line.description}</p>
                {line.checkIn && line.checkOut && (
                  <p className="text-sm text-muted-foreground">
                    {formatDay(line.checkIn)} – {formatDay(line.checkOut)}
                    {line.guests ? ` · ${line.guests} ${line.guests === 1 ? "guest" : "guests"}` : ""}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {line.quantity} × ${line.unitPrice}
                  {line.kind === "room" ? " a night" : ""}
                </p>
              </div>
              <p className="shrink-0">${line.amount}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-border/70 pt-4 text-sm">
          {quote.discount > 0 && (
            <>
              <div className="flex justify-between gap-4 text-muted-foreground">
                <span>Subtotal</span>
                <span>${quote.subtotal}</span>
              </div>
              <div className="flex justify-between gap-4 text-muted-foreground">
                <span>{quote.discountNote || "Discount"}</span>
                <span>-${quote.discount}</span>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-display text-lg">Total</span>
            <span className="font-display text-2xl">${quote.total}</span>
          </div>
        </div>
      </div>

      {quote.notes && <p className="rounded-2xl bg-secondary/60 px-4 py-3 text-sm whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>}

      {open && !declining && (
        <div className="space-y-4">
          <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-0.5" checked={policy} onChange={(event) => setPolicy(event.target.checked)} />
            <span>
              I agree to the{" "}
              <Link href="/policies" target="_blank" className="text-accent underline underline-offset-4">
                Booking &amp; Cancellation Policy
              </Link>
              .
            </span>
          </label>
          {accept.isError && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(accept.error)}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!policy || busy}
              onClick={() => accept.mutate({ id: quote.id, policyAccepted: true })}
              className={buttonClass({ shape: "pill", size: "lg" })}
            >
              {accept.isPending ? <Spinner /> : <Check aria-hidden />}
              Accept quotation
            </button>
            <button type="button" disabled={busy} onClick={() => setDeclining(true)} className={buttonClass({ variant: "ghost", shape: "pill", size: "lg" })}>
              <X aria-hidden />
              Decline
            </button>
          </div>
          <p className="text-sm text-muted-foreground">Your stay is confirmed once your payment is received.</p>
        </div>
      )}

      {open && declining && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            decline.mutate({ id: quote.id, reason: reason || undefined });
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            Anything you&rsquo;d like us to know? (optional)
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
            />
          </label>
          {decline.isError && (
            <p role="alert" className="text-sm text-destructive">
              {friendlyError(decline.error)}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className={buttonClass({ variant: "danger", shape: "pill" })}>
              {decline.isPending && <Spinner />}
              Decline quotation
            </button>
            <button type="button" onClick={() => setDeclining(false)} className={buttonClass({ variant: "ghost", shape: "pill" })}>
              Go back
            </button>
          </div>
        </form>
      )}

      {quote.status === "accepted" && (
        <div className="rounded-3xl border border-accent/40 bg-accent/5 p-6">
          <p className="font-display text-xl">Thank you. Your quotation is accepted.</p>
          {quote.bookings.length > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Pay below to confirm your stay.</p>
              <ul className="mt-4 space-y-2">
                {quote.bookings.map((booking) => (
                  <li key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
                    <span>
                      <span className="block">{booking.roomName}</span>
                      <span className="block font-mono text-xs tracking-wider text-accent">{booking.reference}</span>
                    </span>
                    {booking.paymentStatus === "verified" ? (
                      <span className="text-sm text-muted-foreground">Paid in full</span>
                    ) : (
                      <a href={`/pay/${booking.reference}`} className={buttonClass({ shape: "pill", size: "sm" })}>
                        {booking.amountPaid > 0 ? "Pay the balance" : `Pay the $${booking.depositAmount} deposit`}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">The team will contact you to arrange the rest.</p>
          )}
        </div>
      )}

      {quote.status === "declined" && <p className="text-muted-foreground">You declined this quotation. Thank you for letting us know.</p>}
      {CLOSED_MESSAGE[quote.status] && (
        <p className="text-muted-foreground">
          {CLOSED_MESSAGE[quote.status]} Please contact {quote.property.phone} or {quote.property.email}.
        </p>
      )}

      <a href={`/quote/${quote.id}/pdf`} className={buttonClass({ variant: "secondary", shape: "pill" })}>
        <Download aria-hidden />
        Download PDF
      </a>
    </div>
  );
}
