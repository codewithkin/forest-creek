"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { friendlyError } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { money } from "./kpi";

type RefundBooking = {
  id: string;
  reference: string;
  totalAmount: number;
  refundStatus: string | null;
  refundNote: string | null;
  refundedBy: string | null;
  refundedAt: string | null;
};

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The refund owed on a cancelled paid booking. Paynow cannot refund, so the
 * money goes back outside the app (an EcoCash reversal, a transfer) and this
 * records it — or records why nothing is owed — and emails the guest.
 */
export function RefundPanel({ booking }: { booking: RefundBooking }) {
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const record = useMutation(
    trpc.bookings.recordRefund.mutationOptions({
      onSuccess: async (after) => {
        toast.success(
          after?.refundStatus === "refunded"
            ? `Refund recorded for ${booking.reference} — the guest has been emailed`
            : `No refund for ${booking.reference} — the guest has been told why`,
        );
        setNote("");
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  if (booking.refundStatus === "refunded" || booking.refundStatus === "declined") {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {booking.refundStatus === "refunded" ? "Refunded" : "Refund declined"}
        {booking.refundedBy ? ` by ${booking.refundedBy}` : ""}
        {booking.refundedAt ? ` on ${day(booking.refundedAt)}` : ""}
        {booking.refundNote ? ` — ${booking.refundNote}` : ""}
      </p>
    );
  }

  if (booking.refundStatus !== "due") return null;

  const pending = record.isPending ? record.variables?.outcome : undefined;

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="mt-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-3"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-accent">
        <Undo2 aria-hidden className="size-4" />
        Refund due: {money(booking.totalAmount)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Send it by EcoCash or transfer, then record the reference here. If the cancellation
        policy means nothing is owed, say why — the guest is emailed either way.
      </p>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        placeholder="Refund reference, or the reason no refund is due"
        aria-label="Refund reference or reason"
        className="mt-3 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!note.trim() || record.isPending}
          onClick={() => record.mutate({ id: booking.id, outcome: "refunded", note: note.trim() })}
          className={buttonClass({ size: "sm" })}
        >
          {pending === "refunded" && <Spinner />}
          Mark refunded
        </button>
        <button
          type="button"
          disabled={!note.trim() || record.isPending}
          onClick={() => record.mutate({ id: booking.id, outcome: "declined", note: note.trim() })}
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          {pending === "declined" && <Spinner />}
          No refund due
        </button>
      </div>
    </form>
  );
}
