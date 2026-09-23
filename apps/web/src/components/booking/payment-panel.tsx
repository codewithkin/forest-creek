"use client";

import { Check, CreditCard, Smartphone } from "lucide-react";
import Link from "next/link";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";

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
      amountUsd: number;
      instructions: string;
      redirectUrl?: string;
      innbucks?: { authorizationcode: string; deep_link_url: string; qr_code: string };
    }
  | { ok: false; error: string };

type CheckPaymentResult =
  | { ok: true; paid: boolean; bookingStatus: string; paymentStatus: string }
  | { ok: false; error: string };

export type PanelBooking = {
  reference: string;
  roomName: string;
  totalAmount: number;
  /** Absent on the payment page, which never sees who the guest is. */
  guestEmail?: string;
  /** When the dates are released if unpaid; absent for a stay with no hold. */
  holdExpiresAt?: string | Date | null;
};

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

  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <ReferenceCard booking={booking} confirmed={confirmed} rail={rail} />

      {confirmed ? (
        <>
          <p className="mt-6 leading-relaxed text-muted-foreground">
            Payment received — your stay is confirmed. We&rsquo;ll email{" "}
            {booking.guestEmail ?? "you"} with the details.
          </p>
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
              Pay ${booking.totalAmount} on Paynow
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

function ReferenceCard({
  booking,
  confirmed,
  rail,
}: {
  booking: PanelBooking;
  confirmed: boolean;
  rail: PaymentRail;
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
      </dl>

      {!confirmed && booking.holdExpiresAt && (
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
