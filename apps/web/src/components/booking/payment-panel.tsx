"use client";

import { Check, CreditCard, Smartphone } from "lucide-react";
import Link from "next/link";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";

import { ReceiptList } from "./receipt-list";
import type { PaymentRail } from "./types";

/*
 * Both rails resolve to the same shape: mobile money only ever returns
 * instructions, while the hosted-page rails add the page to open and, for
 * InnBucks, the authorisation code.
 */
type StartPaymentResult =
  | {
      ok: true;
      reference: string;
      /** What THIS charge is for: the deposit, the balance, or the whole stay. */
      amountUsd: number;
      kind?: "deposit" | "balance" | "full";
      /** Still owed once this charge is paid. */
      balanceAfter?: number;
      instructions: string;
      redirectUrl?: string;
      innbucks?: { authorizationcode: string; deep_link_url: string; qr_code: string };
    }
  | { ok: false; error: string };

type CheckPaymentResult =
  | {
      ok: true;
      paid: boolean;
      bookingStatus: string;
      paymentStatus: string;
      amountPaid?: number;
      balanceDue?: number;
    }
  | { ok: false; error: string };

export type PanelBooking = {
  reference: string;
  roomName: string;
  totalAmount: number;
  /** Absent on the payment page, which never sees who the guest is. */
  guestEmail?: string;
  /** When the dates are released if unpaid; absent for a stay with no hold. */
  holdExpiresAt?: string | Date | null;
  /** When the balance is due, if a deposit leaves one. */
  balanceDueAt?: string | Date | null;
};

/** Stay dates are UTC midnights, so they format in UTC or shift a day. */
function dueDay(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PaymentPanel({
  booking,
  rail,
  payment,
  paymentCheck,
  confirmed,
  onRetryCheck,
}: {
  booking: PanelBooking;
  rail: PaymentRail;
  payment: {
    data?: StartPaymentResult;
    isPending: boolean;
    isError: boolean;
    error?: { message?: string } | null;
  };
  paymentCheck: { data?: CheckPaymentResult; isFetching: boolean };
  confirmed: boolean;
  onRetryCheck: () => void;
}) {
  const started = payment.data?.ok === true ? payment.data : undefined;
  const balanceDue =
    paymentCheck.data?.ok === true ? (paymentCheck.data.balanceDue ?? 0) : (started?.balanceAfter ?? 0);

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <ReferenceCard booking={booking} confirmed={confirmed} rail={rail} charge={started} />

      {confirmed ? (
        <>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            {balanceDue > 0 ? "Deposit received" : "Payment received"} — your stay is confirmed.
            We&rsquo;ll email {booking.guestEmail ?? "you"} with the details.
          </p>
          {balanceDue > 0 && (
            <p className="mt-3 leading-relaxed text-muted-foreground">
              The balance of ${balanceDue} is due
              {booking.balanceDueAt ? ` by ${dueDay(booking.balanceDueAt)}` : ""}. Pay it any time at{" "}
              <a href={`/pay/${booking.reference}`} className="text-accent underline underline-offset-4">
                your booking&rsquo;s payment page
              </a>
              .
            </p>
          )}
          <ReceiptList reference={booking.reference} watch />
          <Link
            href="/"
            className={buttonClass({ variant: "secondary", shape: "pill", size: "lg", className: "mt-9" })}
          >
            Back to the lodge
          </Link>
        </>
      ) : payment.isPending || !payment.data ? (
        <p className="mt-6 inline-flex items-center gap-2 text-muted-foreground">
          <Spinner />{" "}
          {rail === "mobile" ? "Sending a payment prompt to your phone…" : "Opening a secure Paynow checkout…"}
        </p>
      ) : payment.isError || payment.data.ok === false ? (
        <>
          <p className="mt-6 leading-relaxed text-destructive">
            {payment.data?.ok === false ? payment.data.error : friendlyError(payment.error)}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing has been charged. Your booking is {booking.reference}.
          </p>
          {/* A plain navigation, so the payment page starts fresh — another method, another number. */}
          <a
            href={`/pay/${booking.reference}`}
            className={buttonClass({ variant: "secondary", shape: "pill", className: "mt-6" })}
          >
            Try again or pay another way
          </a>
        </>
      ) : (
        <>
          <p className="mt-6 leading-relaxed text-muted-foreground">{started?.instructions}</p>

          {started?.innbucks && (
            <div className="mt-6 rounded-2xl border border-border/70 bg-card p-5">
              <p className="text-xs tracking-[0.15em] text-muted-foreground uppercase">
                InnBucks code
              </p>
              <p className="mt-1 font-display text-3xl tracking-widest text-accent">
                {started.innbucks.authorizationcode}
              </p>
              <img
                src={started.innbucks.qr_code}
                alt="InnBucks payment QR code"
                className="mx-auto mt-4 h-40 w-40 rounded-lg bg-white p-2"
              />
              <a
                href={started.innbucks.deep_link_url}
                className={buttonClass({ shape: "pill", className: "mt-4" })}
              >
                Open InnBucks
              </a>
            </div>
          )}

          {/* A new tab, so this page keeps polling while the guest pays. */}
          {started?.redirectUrl && !started.innbucks && (
            <a
              href={started.redirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ shape: "pill", size: "lg", className: "mt-6" })}
            >
              Pay ${started.amountUsd} on Paynow
            </a>
          )}

          <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
            {paymentCheck.isFetching ? <Spinner /> : null}{" "}
            {rail === "mobile"
              ? "Waiting for you to approve it on your phone…"
              : "Waiting for Paynow to confirm your payment…"}
          </p>
          <button
            type="button"
            onClick={onRetryCheck}
            disabled={paymentCheck.isFetching}
            className={buttonClass({ variant: "secondary", shape: "pill", className: "mt-5 block mx-auto" })}
          >
            {rail === "mobile" ? "I’ve approved it — check now" : "I’ve paid — check now"}
          </button>
          <p className="mt-6 text-xs text-muted-foreground">
            Keep {booking.reference} handy — it is how we find your stay if you need to contact the lodge.
          </p>
        </>
      )}
    </div>
  );
}

const chargeLabels = { deposit: "Deposit now", balance: "Balance now", full: "Paying now" } as const;

function ReferenceCard({
  booking,
  confirmed,
  rail,
  charge,
}: {
  booking: PanelBooking;
  confirmed: boolean;
  rail: PaymentRail;
  charge?: { amountUsd: number; kind?: "deposit" | "balance" | "full" };
}) {
  return (
    <>
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border ${
          confirmed ? "border-accent/40" : "border-border/70"
        }`}
      >
        {confirmed ? (
          <Check className="h-6 w-6 text-accent" />
        ) : (
          rail === "mobile" ? (
            <Smartphone className="h-6 w-6 text-muted-foreground" />
          ) : (
            <CreditCard className="h-6 w-6 text-muted-foreground" />
          )
        )}
      </div>
      <h2 className="mt-7 font-display text-4xl font-light">
        {confirmed ? "You're all set" : rail === "mobile" ? "Check your phone" : "Finish paying on Paynow"}
      </h2>

      <dl className="mt-9 rounded-2xl border border-border/70 bg-card p-6 text-left">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Reference</dt>
          <dd className="font-display text-2xl tracking-wider text-accent">{booking.reference}</dd>
        </div>
        <div className="mt-4 flex justify-between gap-4 border-t border-border/70 pt-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="font-display text-2xl">${booking.totalAmount}</dd>
        </div>
        {charge && charge.amountUsd !== booking.totalAmount && (
          <div className="mt-3 flex justify-between gap-4">
            <dt className="text-muted-foreground">{chargeLabels[charge.kind ?? "full"]}</dt>
            <dd className="font-display text-xl text-accent">${charge.amountUsd}</dd>
          </div>
        )}
      </dl>

      {/* A balance charge on a confirmed stay has no hold to lose. */}
      {!confirmed && booking.holdExpiresAt && charge?.kind !== "balance" && (
        <p className="mt-4 text-sm text-muted-foreground">
          These dates are held for you until{" "}
          {new Date(booking.holdExpiresAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          . If the payment hasn&rsquo;t gone through by then, they&rsquo;re released.
        </p>
      )}
    </>
  );
}
