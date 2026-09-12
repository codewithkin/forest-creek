"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

const filters = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Awaiting payment" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
] as const;

type PaymentFilter = (typeof filters)[number]["value"];

const statusTone: Record<string, string> = {
  pending: "border-accent/40 text-accent",
  verified: "border-emerald-500/40 text-emerald-400",
  rejected: "border-destructive/40 text-destructive",
  confirmed: "border-emerald-500/40 text-emerald-400",
  cancelled: "border-destructive/40 text-destructive",
};

function Pill({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs ${
        statusTone[value] ?? "border-border text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}

export default function BookingsTable() {
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>(undefined);
  const queryClient = useQueryClient();

  const listOptions = trpc.bookings.list.queryOptions({ paymentStatus });
  const bookings = useQuery(listOptions);

  const setPayment = useMutation(
    trpc.bookings.setPaymentStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: listOptions.queryKey }),
    }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-light">Bookings</h1>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              onClick={() => setPaymentStatus(filter.value)}
              className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                paymentStatus === filter.value
                  ? "border-accent text-accent"
                  : "border-border/70 text-muted-foreground hover:border-accent/50"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {bookings.isPending && (
        <p className="mt-10 text-sm text-muted-foreground">Loading bookings…</p>
      )}

      {bookings.data?.length === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">Nothing here yet.</p>
      )}

      <div className="mt-8 space-y-4">
        {bookings.data?.map((booking) => (
          <article
            key={booking.id}
            className="rounded-2xl border border-border/70 bg-card p-5 md:flex md:items-start md:justify-between md:gap-8"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <h2 className="font-display text-xl tracking-wider text-accent">
                  {booking.reference}
                </h2>
                <Pill value={booking.bookingStatus} />
                <Pill value={booking.paymentStatus} />
              </div>

              <p className="mt-2 text-sm">
                {booking.guestName} · {booking.guestEmail}
                {booking.guestPhone ? ` · ${booking.guestPhone}` : ""}
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {booking.roomName} · {booking.checkIn.slice(0, 10)} →{" "}
                {booking.checkOut.slice(0, 10)} · {booking.nights}{" "}
                {booking.nights === 1 ? "night" : "nights"} · {booking.guests} guests ·{" "}
                {booking.paymentMethod.replace("_", " ")}
              </p>

              {booking.activityNames.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Experiences: {booking.activityNames.join(", ")}
                </p>
              )}

              {booking.notes && (
                <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">
                  {booking.notes}
                </p>
              )}

              {booking.verifiedBy && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Handled by {booking.verifiedBy}
                </p>
              )}
            </div>

            <div className="mt-5 flex shrink-0 flex-col items-start gap-3 md:mt-0 md:items-end">
              <p className="font-display text-2xl">${booking.totalAmount}</p>

              {booking.paymentStatus === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={setPayment.isPending}
                    onClick={() =>
                      setPayment.mutate({ id: booking.id, paymentStatus: "verified" })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
                  >
                    {setPayment.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Verify payment
                  </button>
                  <button
                    type="button"
                    disabled={setPayment.isPending}
                    onClick={() =>
                      setPayment.mutate({ id: booking.id, paymentStatus: "rejected" })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
