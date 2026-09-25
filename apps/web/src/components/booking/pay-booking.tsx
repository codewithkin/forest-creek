"use client";

import { Input } from "@forest-creek/ui/components/input";
import { Label } from "@forest-creek/ui/components/label";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { lodge, telHref } from "@/lib/lodge";
import { trpc } from "@/utils/trpc";

import { PaymentPanel } from "./payment-panel";
import { ReceiptList } from "./receipt-list";
import { paymentMethods, railFor, type PaymentMethodValue } from "./types";

/** The guest-safe view bookings.byReference returns — no email, phone or notes. */
export type GuestBooking = {
  reference: string;
  propertyName: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  activityNames: string[];
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  bookingStatus: string;
  holdExpiresAt: string | null;
  holdLapsed: boolean;
  amountPaid: number;
  depositAmount: number;
  balanceDue: number;
  balanceDueDate: string | null;
  amountDueNow: number;
  chargeInFlight: boolean;
};

const isKnownMethod = (method: string): method is PaymentMethodValue =>
  paymentMethods.some((candidate) => candidate.value === method);

/** Stay dates are UTC midnights, so they format in UTC or shift a day. */
function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Pays for a booking that already exists: the WhatsApp agent sends InnBucks
 * and card guests here, and a website guest whose payment failed comes back
 * to try again, with any method. The server re-checks the room is still free
 * before charging if the hold ran out — nothing here decides that.
 */
export default function PayBooking({ booking }: { booking: GuestBooking }) {
  const [method, setMethod] = useState<PaymentMethodValue>(
    isKnownMethod(booking.paymentMethod) ? booking.paymentMethod : "ecocash",
  );
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState("");
  // Only a choice before anything is paid, and only when a deposit applies.
  const depositStage = booking.amountPaid === 0 && booking.depositAmount < booking.totalAmount;
  const [payInFull, setPayInFull] = useState(false);
  const chargeNow = depositStage && !payInFull ? booking.depositAmount : booking.balanceDue;
  const [started, setStarted] = useState(false);
  // An earlier charge the guest never approved must not trap them on "checking".
  const [payAnotherWay, setPayAnotherWay] = useState(false);
  const rail = railFor(method);

  const choose = useMutation(trpc.bookings.choosePaymentMethod.mutationOptions());
  const mobile = useMutation(trpc.bookings.payWithMobileMoney.mutationOptions());
  const web = useMutation(trpc.bookings.startWebCheckout.mutationOptions());
  const payment = rail === "mobile" ? mobile : web;

  // Polls once a charge is under way — and straight away if the guest left
  // one in flight, since it may have gone through while they were away.
  const alreadyInFlight = booking.chargeInFlight && !payAnotherWay;
  const paymentCheck = useQuery({
    ...trpc.bookings.checkPayment.queryOptions({ reference: booking.reference }),
    enabled: alreadyInFlight || payment.data?.ok === true,
    refetchInterval: (query) => (query.state.data?.ok && query.state.data.paid ? false : 4000),
  });
  // "Done" means nothing is left to pay. A paid deposit confirms the stay but
  // leaves the balance, which this page is also for.
  const justPaid = paymentCheck.data?.ok === true && paymentCheck.data.paid;
  const balanceNow = justPaid && paymentCheck.data?.ok ? (paymentCheck.data.balanceDue ?? 0) : booking.balanceDue;
  const confirmed = booking.paymentStatus === "verified" || (justPaid && balanceNow === 0);
  const depositPaid = !confirmed && (booking.amountPaid > 0 || justPaid);

  const panelBooking = {
    reference: booking.reference,
    roomName: booking.roomName,
    totalAmount: booking.totalAmount,
    holdExpiresAt: booking.holdExpiresAt,
    balanceDueAt: booking.balanceDueDate,
  };

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    try {
      // Also when a charge was left in flight: choosing first asks Paynow about
      // it, so a payment approved late is found rather than lost to a new one.
      if (method !== booking.paymentMethod || booking.chargeInFlight) {
        await choose.mutateAsync({ reference: booking.reference, method });
      }
    } catch {
      return; // choose.error is shown below
    }
    setStarted(true);
    if (rail === "mobile") {
      mobile.mutate({ reference: booking.reference, mobileMoneyNumber, payInFull });
    } else {
      web.mutate({ reference: booking.reference, payInFull });
    }
  }

  const summary = (
    <dl className="rounded-2xl border border-border/70 bg-card p-6 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-display text-xl tracking-wider text-accent">{booking.reference}</dd>
      </div>
      <div className="mt-3 flex justify-between gap-4">
        <dt className="text-muted-foreground">Stay</dt>
        <dd className="text-right">
          {booking.roomName} at {booking.propertyName}
        </dd>
      </div>
      <div className="mt-3 flex justify-between gap-4">
        <dt className="text-muted-foreground">Dates</dt>
        <dd className="text-right">
          {formatDay(booking.checkIn)} – {formatDay(booking.checkOut)} · {booking.nights}{" "}
          {booking.nights === 1 ? "night" : "nights"}
        </dd>
      </div>
      {booking.activityNames.length > 0 && (
        <div className="mt-3 flex justify-between gap-4">
          <dt className="text-muted-foreground">Experiences</dt>
          <dd className="text-right">{booking.activityNames.join(", ")}</dd>
        </div>
      )}
      <div className="mt-4 flex justify-between gap-4 border-t border-border/70 pt-4">
        <dt className="font-display text-lg">Total</dt>
        <dd className="font-display text-2xl">${booking.totalAmount}</dd>
      </div>
      {booking.amountPaid > 0 && (
        <>
          <div className="mt-2 flex justify-between gap-4">
            <dt className="text-muted-foreground">Paid so far</dt>
            <dd>${booking.amountPaid}</dd>
          </div>
          {booking.balanceDue > 0 && (
            <div className="mt-2 flex justify-between gap-4">
              <dt className="text-muted-foreground">Balance</dt>
              <dd className="text-right text-accent">
                ${booking.balanceDue}
                {booking.balanceDueDate ? ` · due ${formatDay(booking.balanceDueDate)}` : ""}
              </dd>
            </div>
          )}
        </>
      )}
    </dl>
  );

  if (confirmed) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-accent/40">
          <Check className="h-6 w-6 text-accent" />
        </div>
        <h2 className="mt-6 font-display text-3xl font-light">Paid in full — you&rsquo;re all set</h2>
        <div className="mt-8 text-left">{summary}</div>
        <ReceiptList reference={booking.reference} watch={justPaid} />
        <Link href="/" className={buttonClass({ variant: "secondary", shape: "pill", size: "lg", className: "mt-8" })}>
          Back to the lodge
        </Link>
      </div>
    );
  }

  if (booking.bookingStatus === "cancelled") {
    return (
      <div>
        {summary}
        <p className="mt-6 leading-relaxed text-muted-foreground">
          This booking was cancelled, so there is nothing to pay. If that is a surprise, call{" "}
          <a href={telHref(lodge.phone)} className="text-accent underline underline-offset-4">
            {lodge.phone}
          </a>{" "}
          or email{" "}
          <a href={`mailto:${lodge.email}`} className="text-accent underline underline-offset-4">
            {lodge.email}
          </a>
          .
        </p>
      </div>
    );
  }

  if (started || alreadyInFlight) {
    return (
      <>
      <PaymentPanel
        booking={panelBooking}
        rail={started ? rail : railFor(isKnownMethod(booking.paymentMethod) ? booking.paymentMethod : "ecocash")}
        payment={
          started
            ? payment
            : {
                // A charge left in flight from an earlier visit: nothing to
                // start, just keep checking whether it has landed.
                data: {
                  ok: true,
                  reference: booking.reference,
                  amountUsd: booking.totalAmount,
                  instructions: "We're checking whether your earlier payment has gone through.",
                },
                isPending: false,
                isError: false,
              }
        }
        paymentCheck={paymentCheck}
        confirmed={confirmed || justPaid}
        onRetryCheck={() => void paymentCheck.refetch()}
      />
      {!started && (
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Didn&rsquo;t approve it?{" "}
          <button
            type="button"
            onClick={() => setPayAnotherWay(true)}
            className="text-accent underline underline-offset-4"
          >
            Pay another way
          </button>
        </p>
      )}
      </>
    );
  }

  return (
    <form onSubmit={pay}>
      {summary}

      {depositPaid && (
        <p className="mt-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          Your deposit is in and your stay is confirmed. Pay the balance of ${balanceNow}
          {booking.balanceDueDate ? ` by ${formatDay(booking.balanceDueDate)}` : ""} below, whenever
          suits you.
        </p>
      )}
      {depositPaid && <ReceiptList reference={booking.reference} watch={justPaid} />}

      {depositStage && (
        <fieldset className="mt-6 space-y-2">
          <legend className="font-display text-xl">How much now?</legend>
          {[
            {
              full: false,
              title: `The deposit: $${booking.depositAmount}`,
              hint: `50%, non-refundable, secures the stay. The balance of $${booking.totalAmount - booking.depositAmount} is due${booking.balanceDueDate ? ` by ${formatDay(booking.balanceDueDate)}` : " later"}.`,
            },
            { full: true, title: `The whole stay: $${booking.totalAmount}`, hint: "Nothing left to pay later." },
          ].map((option) => (
            <label
              key={String(option.full)}
              className={`mt-3 block cursor-pointer rounded-xl border px-4 py-3 text-sm transition-colors ${
                payInFull === option.full ? "border-accent" : "border-border/70 hover:border-accent/50"
              }`}
            >
              <input
                type="radio"
                name="payInFull"
                checked={payInFull === option.full}
                onChange={() => setPayInFull(option.full)}
                className="sr-only"
              />
              <span className={`block font-medium ${payInFull === option.full ? "text-accent" : ""}`}>
                {option.title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
            </label>
          ))}
        </fieldset>
      )}

      {booking.holdLapsed || booking.bookingStatus === "expired" ? (
        <p className="mt-6 rounded-lg bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
          Your hold on these dates ran out. You can still pay — we&rsquo;ll check the room is free
          first, and hold it again while you pay.
        </p>
      ) : (
        booking.holdExpiresAt &&
        booking.bookingStatus === "pending" && (
          <p className="mt-6 text-sm text-muted-foreground">
            We&rsquo;re holding these dates until{" "}
            {new Date(booking.holdExpiresAt).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            . Pay before then to keep them.
          </p>
        )
      )}

      <fieldset disabled={choose.isPending || payment.isPending} className="mt-8">
        <legend className="font-display text-xl">How would you like to pay?</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {paymentMethods.map((candidate) => (
            <label
              key={candidate.value}
              className={`cursor-pointer rounded-2xl border px-4 py-3 text-sm transition-colors ${
                method === candidate.value
                  ? "border-accent text-accent"
                  : "border-border/70 text-muted-foreground hover:border-accent/50"
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={candidate.value}
                checked={method === candidate.value}
                onChange={() => setMethod(candidate.value)}
                className="sr-only"
              />
              <span className="block font-medium">{candidate.label}</span>
              <span className="mt-0.5 block text-xs opacity-70">{candidate.hint}</span>
            </label>
          ))}
        </div>

        {rail === "mobile" && (
          <div className="mt-5 max-w-sm">
            <Label htmlFor="mobileMoneyNumber">
              {paymentMethods.find((candidate) => candidate.value === method)?.label} number
            </Label>
            <Input
              id="mobileMoneyNumber"
              type="tel"
              required
              placeholder="07XX XXX XXX"
              value={mobileMoneyNumber}
              onChange={(event) => setMobileMoneyNumber(event.target.value)}
              className="mt-2"
            />
          </div>
        )}

        {choose.isError && (
          <p className="mt-5 text-sm text-destructive" role="alert">
            {friendlyError(choose.error)}
          </p>
        )}

        <button type="submit" className={buttonClass({ shape: "pill", size: "lg", className: "mt-8 w-full sm:w-auto" })}>
          {(choose.isPending || payment.isPending) && <Spinner />}
          Pay ${chargeNow}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">
          Payments follow our{" "}
          <a href="/policies" className="text-accent underline underline-offset-4">
            booking &amp; cancellation policy
          </a>
          .
        </p>
      </fieldset>
    </form>
  );
}
