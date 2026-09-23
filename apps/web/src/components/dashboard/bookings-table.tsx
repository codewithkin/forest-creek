"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, CalendarX, Check, Globe, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton, StateMessage } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { BookingActivity } from "./booking-activity";
import { money } from "./kpi";
import { useProperties } from "./property-context";

const filters = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Awaiting payment" },
  { value: "processing", label: "Charge sent" },
  { value: "verified", label: "Paid" },
  { value: "rejected", label: "Rejected" },
] as const;

type PaymentFilter = (typeof filters)[number]["value"];

type Tone = { label: string; className: string };

// Staff read these at a glance, so they say what the state means, not the enum.
const bookingTones: Record<string, Tone> = {
  pending: { label: "Held", className: "bg-secondary text-muted-foreground" },
  confirmed: { label: "Confirmed", className: "bg-emerald-500/10 text-emerald-300" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
  // An unpaid hold that ran out; its nights went back on sale by themselves.
  expired: { label: "Hold expired", className: "bg-secondary text-muted-foreground/70" },
};

/** Ended bookings take no more actions: the room is already free. */
const ended = (status: string) => status === "cancelled" || status === "expired";

const paymentTones: Record<string, Tone> = {
  pending: { label: "Payment pending", className: "bg-accent/10 text-accent" },
  // Paynow has sent a charge to the guest's phone; verified/rejected below is
  // still the auto (Paynow) or manual outcome that follows it.
  processing: { label: "Charge sent", className: "bg-accent/10 text-accent" },
  verified: { label: "Paid", className: "bg-emerald-500/10 text-emerald-300" },
  rejected: { label: "Payment rejected", className: "bg-destructive/10 text-destructive" },
};

const paymentMethods: Record<string, string> = {
  ecocash: "Ecocash",
  onemoney: "OneMoney",
  innbucks: "InnBucks",
  visa: "Visa / Mastercard",
  // Legacy: bookings made before mobile-money-only. Historical rows keep
  // whatever method they were made with rather than being rewritten.
  card: "Card",
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
};

function Badge({ tone }: { tone?: Tone }) {
  if (!tone) return null;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone.className}`}>
      {tone.label}
    </span>
  );
}

/** Stay dates are stored as UTC midnights, so they are formatted in UTC or they shift a day. */
function formatStay(checkIn: string, checkOut: string): string {
  const day = { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" } as const;
  const from = new Date(checkIn).toLocaleDateString("en-GB", day);
  const to = new Date(checkOut).toLocaleDateString("en-GB", { ...day, year: "numeric" });
  return `${from} – ${to}`;
}

export default function BookingsTable() {
  const { selectedId, selected } = useProperties();
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>(undefined);
  const [confirmingReject, setConfirmingReject] = useState<string>();
  const [confirmingCancel, setConfirmingCancel] = useState<string>();
  const queryClient = useQueryClient();

  const bookings = useQuery(
    trpc.bookings.list.queryOptions({ paymentStatus, propertyId: selectedId }),
  );

  const setPayment = useMutation(
    trpc.bookings.setPaymentStatus.mutationOptions({
      onSuccess: async (booking) => {
        toast.success(
          booking.paymentStatus === "verified"
            ? `Payment recorded — ${booking.reference} is confirmed`
            : `Payment rejected for ${booking.reference}`,
        );
        setConfirmingReject(undefined);
        // Today's counts and the booking list both change, so refresh everything on screen.
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const cancelBooking = useMutation(
    trpc.bookings.cancel.mutationOptions({
      onSuccess: async (booking) => {
        toast.success(`${booking.reference} cancelled — those nights are free again`);
        setConfirmingCancel(undefined);
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  // Only the row being changed shows as busy; the rest stay usable.
  const busyId = setPayment.isPending
    ? setPayment.variables?.id
    : cancelBooking.isPending
      ? cancelBooking.variables?.id
      : undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected?.name ?? "All properties"}
            {bookings.data ? ` · ${bookings.data.length} shown` : ""}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filter by payment"
          className="flex w-full gap-1 overflow-x-auto rounded-lg border border-border/70 p-1 sm:w-auto"
        >
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              role="tab"
              aria-selected={paymentStatus === filter.value}
              onClick={() => setPaymentStatus(filter.value)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
                paymentStatus === filter.value
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      {bookings.isPending && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {bookings.isError && (
        <ErrorMessage
          title="Bookings didn't load"
          error={bookings.error}
          onRetry={() => void bookings.refetch()}
        />
      )}

      {bookings.data?.length === 0 && (
        <StateMessage
          icon={CalendarRange}
          title={paymentStatus === "pending" ? "Nothing awaiting payment" : "No bookings here yet"}
          description={
            paymentStatus
              ? "Try another filter, or check back once guests have booked."
              : "Bookings from the website and WhatsApp will appear here as they come in."
          }
        />
      )}

      <ul className="space-y-3">
        {bookings.data?.map((booking) => {
          const busy = busyId === booking.id;
          const canSettle =
            (booking.paymentStatus === "pending" || booking.paymentStatus === "processing") &&
            !ended(booking.bookingStatus);

          return (
            <li key={booking.id} className="rounded-xl border border-border/70 bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm tracking-wider text-accent">
                      {booking.reference}
                    </span>
                    <Badge tone={bookingTones[booking.bookingStatus]} />
                    <Badge tone={paymentTones[booking.paymentStatus]} />
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {booking.channel === "whatsapp" ? (
                        <MessageCircle className="size-3.5" aria-hidden />
                      ) : (
                        <Globe className="size-3.5" aria-hidden />
                      )}
                      {booking.channel === "whatsapp" ? "WhatsApp" : "Website"}
                    </span>
                  </div>

                  <p className="mt-3 font-medium">{booking.guestName}</p>
                  <p className="text-sm break-all text-muted-foreground">
                    {booking.guestEmail}
                    {booking.guestPhone ? ` · ${booking.guestPhone}` : ""}
                  </p>

                  <p className="mt-3 text-sm">
                    {formatStay(booking.checkIn, booking.checkOut)} · {booking.nights}{" "}
                    {booking.nights === 1 ? "night" : "nights"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {booking.roomName}
                    {selectedId ? "" : ` at ${booking.propertyName}`} · {booking.guests}{" "}
                    {booking.guests === 1 ? "guest" : "guests"}
                  </p>

                  {booking.activityNames.length > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      With {booking.activityNames.join(", ")}
                    </p>
                  )}

                  {booking.notes && (
                    <p className="mt-3 rounded-lg bg-secondary/60 px-3 py-2.5 text-sm text-muted-foreground">
                      {booking.notes}
                    </p>
                  )}

                  {booking.reviewNote && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                    >
                      Needs attention: {booking.reviewNote}
                    </p>
                  )}

                  {booking.verifiedBy && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Handled by {booking.verifiedBy}
                    </p>
                  )}

                  <BookingActivity booking={booking} />
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 md:flex-col md:items-end md:border-0 md:pt-0">
                  <div className="md:text-right">
                    <p className="font-display text-2xl">{money(booking.totalAmount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {paymentMethods[booking.paymentMethod] ?? booking.paymentMethod}
                      {booking.mobileMoneyNumber ? ` · ${booking.mobileMoneyNumber}` : ""}
                    </p>
                    {booking.paymentStatus === "processing" && (
                      <p className="mt-0.5 text-xs text-accent">Awaiting the guest's approval</p>
                    )}
                  </div>

                  {!ended(booking.bookingStatus) &&
                    (confirmingCancel === booking.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Cancel and free these nights?
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => cancelBooking.mutate({ id: booking.id })}
                          className={buttonClass({ variant: "danger", size: "sm" })}
                        >
                          {busy && <Spinner />}
                          Cancel booking
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingCancel(undefined)}
                          className={buttonClass({ variant: "ghost", size: "sm" })}
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmingCancel(booking.id)}
                        className={buttonClass({ variant: "ghost", size: "sm" })}
                      >
                        <CalendarX aria-hidden />
                        Cancel &amp; free dates
                      </button>
                    ))}

                  {canSettle &&
                    (confirmingReject === booking.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">Reject this payment?</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setPayment.mutate({ id: booking.id, paymentStatus: "rejected" })
                          }
                          className={buttonClass({ variant: "danger", size: "sm" })}
                        >
                          {busy && <Spinner />}
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingReject(undefined)}
                          className={buttonClass({ variant: "ghost", size: "sm" })}
                        >
                          Keep
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setPayment.mutate({ id: booking.id, paymentStatus: "verified" })
                          }
                          className={buttonClass({ size: "sm" })}
                        >
                          {busy ? <Spinner /> : <Check aria-hidden />}
                          Mark paid
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmingReject(booking.id)}
                          className={buttonClass({ variant: "secondary", size: "sm" })}
                        >
                          <X aria-hidden />
                          Reject
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
