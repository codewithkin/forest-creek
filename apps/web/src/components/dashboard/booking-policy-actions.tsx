"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarClock, CalendarX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

type PolicyBooking = {
  id: string;
  reference: string;
  totalAmount: number;
  amountPaid: number;
  checkIn: string;
  checkOut: string;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50";

const usd = (amount: number) =>
  "$" + amount.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 });

type Panel = "none" | "pay" | "cancel" | "dates";

/**
 * What staff do to a live booking under the Booking & Cancellation Policy:
 * record a bank-transfer or cash payment, change the dates (clause 4), or
 * cancel (clauses 2-3) — each shown with what the policy says before it
 * happens, and each worked out by the server, never here.
 */
export function BookingPolicyActions({ booking }: { booking: PolicyBooking }) {
  const [panel, setPanel] = useState<Panel>("none");
  const outstanding = Math.max(0, booking.totalAmount - booking.amountPaid);

  const toggle = (next: Panel) => setPanel((current) => (current === next ? "none" : next));

  return (
    <div className="w-full md:w-auto">
      <div className="flex flex-wrap gap-2 md:justify-end">
        {outstanding > 0 && (
          <button type="button" onClick={() => toggle("pay")} className={buttonClass({ variant: "secondary", size: "sm" })}>
            <Banknote aria-hidden />
            Record payment
          </button>
        )}
        <button type="button" onClick={() => toggle("dates")} className={buttonClass({ variant: "ghost", size: "sm" })}>
          <CalendarClock aria-hidden />
          Change dates
        </button>
        <button type="button" onClick={() => toggle("cancel")} className={buttonClass({ variant: "ghost", size: "sm" })}>
          <CalendarX aria-hidden />
          Cancel &amp; free dates
        </button>
      </div>

      {panel === "pay" && <RecordPayment booking={booking} outstanding={outstanding} onDone={() => setPanel("none")} />}
      {panel === "dates" && <ChangeDates booking={booking} onDone={() => setPanel("none")} />}
      {panel === "cancel" && <CancelWithQuote booking={booking} onDone={() => setPanel("none")} />}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 animate-fade-in rounded-lg border border-border/60 p-3 text-left text-sm md:w-80">
      {children}
    </div>
  );
}

function RecordPayment({
  booking,
  outstanding,
  onDone,
}: {
  booking: PolicyBooking;
  outstanding: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(outstanding));
  const [method, setMethod] = useState<"bank_transfer" | "cash">("bank_transfer");
  const [note, setNote] = useState("");
  const record = useMutation(
    trpc.bookings.recordPayment.mutationOptions({
      onSuccess: async (after) => {
        toast.success(
          after?.paymentStatus === "verified"
            ? `${booking.reference} is paid in full`
            : `Payment recorded — ${booking.reference} is confirmed`,
        );
        await queryClient.invalidateQueries();
        onDone();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  return (
    <Frame>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          record.mutate({ id: booking.id, amount: Number(amount), method, note: note.trim() });
        }}
      >
        <p className="font-medium">Money received outside Paynow</p>
        <p className="text-xs text-muted-foreground">{usd(outstanding)} is outstanding.</p>
        <label className="mt-3 block text-xs">
          Amount (USD)
          <input
            type="number"
            min={1}
            max={outstanding}
            step={1}
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="mt-2 block text-xs">
          How
          <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className={inputClass}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">USD cash</option>
          </select>
        </label>
        <label className="mt-2 block text-xs">
          Reference or receipt
          <input
            required
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Bank ref, receipt no., who took it"
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={record.isPending} className={buttonClass({ size: "sm", className: "mt-3" })}>
          {record.isPending && <Spinner />}
          Record {amount ? usd(Number(amount)) : "payment"}
        </button>
      </form>
    </Frame>
  );
}

function CancelWithQuote({ booking, onDone }: { booking: PolicyBooking; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [noShow, setNoShow] = useState(false);
  const [reason, setReason] = useState("");
  const quote = useQuery(trpc.bookings.cancellationQuote.queryOptions({ id: booking.id, noShow }));
  const cancel = useMutation(
    trpc.bookings.cancel.mutationOptions({
      onSuccess: async (after) => {
        toast.success(`${after?.reference ?? booking.reference} cancelled — those nights are free again`);
        await queryClient.invalidateQueries();
        onDone();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const q = quote.data;
  return (
    <Frame>
      <p className="font-medium">Cancel {booking.reference}?</p>
      {quote.isPending && <p className="mt-2 text-xs text-muted-foreground">Working out the policy…</p>}
      {q && (
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Season</dt>
            <dd>{q.season === "high" ? "High (strict)" : "Low / shoulder"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Days before arrival</dt>
            <dd>{noShow ? "No-show" : q.daysBeforeArrival}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Cancellation fee</dt>
            <dd>{q.feePercent}% ({usd(q.fee)})</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Paid so far</dt>
            <dd>{usd(q.amountPaid)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Kept</dt>
            <dd>{usd(q.retained)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border/60 pt-1 font-medium">
            <dt>Refund to the guest</dt>
            <dd className="text-accent">{usd(q.refundCents / 100)}</dd>
          </div>
          {q.refundCents > 0 && (
            <p className="text-muted-foreground">After the {5}% processing fee. You record it once it is sent.</p>
          )}
        </dl>
      )}
      <label className="mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={noShow} onChange={(event) => setNoShow(event.target.checked)} />
        The guest didn&rsquo;t turn up (no-show)
      </label>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        placeholder="Why — kept on the booking (optional)"
        aria-label="Reason for cancelling"
        className={inputClass}
      />
      <button
        type="button"
        disabled={cancel.isPending || !q}
        onClick={() => cancel.mutate({ id: booking.id, noShow, reason: reason.trim() || undefined })}
        className={buttonClass({ variant: "danger", size: "sm", className: "mt-3" })}
      >
        {cancel.isPending && <Spinner />}
        {noShow ? "Mark no-show & free dates" : "Cancel & free dates"}
      </button>
    </Frame>
  );
}

function ChangeDates({ booking, onDone }: { booking: PolicyBooking; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState(booking.checkIn.slice(0, 10));
  const [checkOut, setCheckOut] = useState(booking.checkOut.slice(0, 10));
  const [override, setOverride] = useState(false);
  const valid = checkOut > checkIn;
  const quote = useQuery({
    ...trpc.bookings.dateChangeQuote.queryOptions({ id: booking.id, checkIn, checkOut }),
    enabled: valid,
  });
  const change = useMutation(
    trpc.bookings.changeDates.mutationOptions({
      onSuccess: async () => {
        toast.success(`${booking.reference} moved — the guest has been emailed`);
        await queryClient.invalidateQueries();
        onDone();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const q = quote.data;
  const verdict = q?.verdict;
  const blocked = !valid || !q?.available || verdict?.kind === "refused" || (verdict?.kind === "not-free" && !override);

  return (
    <Frame>
      <p className="font-medium">Move {booking.reference}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs">
          Arrive
          <input type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} className={inputClass} />
        </label>
        <label className="text-xs">
          Leave
          <input type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} className={inputClass} />
        </label>
      </div>
      {q && (
        <div className="mt-2 space-y-1 text-xs">
          <p className={q.available ? "text-muted-foreground" : "text-destructive"}>
            {q.available ? "The room is free on those dates." : "The room is taken or blocked on those dates."}
          </p>
          <p className="text-muted-foreground">
            {q.nights} {q.nights === 1 ? "night" : "nights"} at {usd(q.rate)} → {usd(q.newTotal)}
            {q.difference !== 0 ? ` (${q.difference > 0 ? "+" : "−"}${usd(Math.abs(q.difference))})` : ""}
          </p>
          <p
            className={
              verdict?.kind === "free"
                ? "text-emerald-300"
                : verdict?.kind === "refused"
                  ? "text-destructive"
                  : "text-accent"
            }
          >
            {verdict?.kind === "free" ? "Free change. " : verdict?.kind === "refused" ? "Not permitted. " : "Not a free change. "}
            {verdict?.reason}
          </p>
          {verdict?.kind === "not-free" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
              Agree it anyway (staff decision)
            </label>
          )}
        </div>
      )}
      <button
        type="button"
        disabled={blocked || change.isPending}
        onClick={() => change.mutate({ id: booking.id, checkIn, checkOut, override })}
        className={buttonClass({ size: "sm", className: "mt-3" })}
      >
        {change.isPending && <Spinner />}
        Move the booking
      </button>
    </Frame>
  );
}
