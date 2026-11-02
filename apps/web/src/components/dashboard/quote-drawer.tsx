"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Download, Link2, Mail, MessageCircle, Pencil, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton } from "@/components/brand/state";
import { trpc } from "@/utils/trpc";

import { paymentChip } from "./booking-labels";
import { BookingDrawer } from "./booking-drawer";
import { DocumentList } from "./document-list";
import { money } from "./kpi";
import { quoteChip } from "./quote-labels";
import { Drawer } from "./ui/overlay";
import { StatusChip } from "./ui/page";

function day(value: string): string {
  return new Date(value.length === 10 ? `${value}T00:00:00Z` : value).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

/** One quotation: its contents, its progress, and sending it. */
export function QuoteDrawer({
  quoteId,
  onClose,
  onEdit,
  onDuplicated,
}: {
  quoteId?: string;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDuplicated: (id: string) => void;
}) {
  const quote = useQuery({ ...trpc.quotes.byId.queryOptions(quoteId ?? ""), enabled: Boolean(quoteId) });
  const data = quote.data;
  const queryClient = useQueryClient();
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [bookingId, setBookingId] = useState<string>();

  const send = useMutation(
    trpc.quotes.send.mutationOptions({
      onSuccess: async (result) => {
        const routes = [result.emailed && "email", result.whatsapped && "WhatsApp"].filter(Boolean).join(" and ");
        toast.success(`Sent by ${routes}`);
        if (result.problem) toast.warning(result.problem);
        await queryClient.invalidateQueries();
      },
      onError: async (error) => {
        toast.error(friendlyError(error));
        await queryClient.invalidateQueries();
      },
    }),
  );
  const duplicate = useMutation(
    trpc.quotes.duplicate.mutationOptions({
      onSuccess: async (copy) => {
        toast.success("Copied to a new draft");
        await queryClient.invalidateQueries();
        onDuplicated(copy.id);
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );
  const cancel = useMutation(
    trpc.quotes.cancel.mutationOptions({
      onSuccess: async () => {
        toast.success("Quotation cancelled");
        await queryClient.invalidateQueries();
      },
      onError: (error) => toast.error(friendlyError(error)),
    }),
  );

  const chip = data ? quoteChip(data.status) : undefined;
  const canSend = data && ["draft", "sent", "viewed"].includes(data.status);
  const link = data ? `${window.location.origin}/quote/${data.id}` : "";

  return (
    <Drawer
      open={Boolean(quoteId)}
      onClose={onClose}
      title={data?.guestName ?? "Quotation"}
      description={data ? <span className="font-mono tracking-wider text-accent">{data.label}</span> : undefined}
    >
      {quote.isPending && <Skeleton className="h-64 w-full rounded-2xl" />}
      {quote.isError && <ErrorMessage title="This quotation didn't load" error={quote.error} onRetry={() => void quote.refetch()} />}
      {data && chip && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
            <span className="text-xs text-muted-foreground">
              {data.property.name} · valid until {day(data.validUntil)}
            </span>
          </div>

          {data.problem && (
            <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-rose-300">
              {data.problem}
            </p>
          )}

          <ul className="divide-y divide-border/40 rounded-2xl bg-card px-4 py-1">
            {data.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block">{line.description}</span>
                  <span className="block text-xs text-muted-foreground">
                    {line.checkIn && line.checkOut ? `${day(line.checkIn)} – ${day(line.checkOut)} · ` : ""}
                    {line.quantity} × {money(line.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0">{money(line.amount)}</span>
              </li>
            ))}
            {data.discount > 0 && (
              <li className="flex justify-between gap-4 py-2.5 text-sm text-muted-foreground">
                <span>{data.discountNote || "Discount"}</span>
                <span>-{money(data.discount)}</span>
              </li>
            )}
            <li className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="text-sm">Total</span>
              <span className="font-display text-xl">{money(data.total)}</span>
            </li>
          </ul>

          {data.notes && <p className="rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm whitespace-pre-wrap text-muted-foreground">{data.notes}</p>}

          {canSend && (
            <section className="rounded-2xl border border-border/60 p-4">
              <h3 className="font-display text-lg">Send to the guest</h3>
              <div className="mt-2 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
                  <Mail className="size-3.5 text-muted-foreground" aria-hidden />
                  {data.guestEmail || <span className="text-muted-foreground">No email on this quotation</span>}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={sendWhatsapp} onChange={(event) => setSendWhatsapp(event.target.checked)} />
                  <MessageCircle className="size-3.5 text-muted-foreground" aria-hidden />
                  {data.guestPhone || <span className="text-muted-foreground">No WhatsApp number on this quotation</span>}
                </label>
              </div>
              <button
                type="button"
                disabled={send.isPending || (!sendEmail && !sendWhatsapp)}
                onClick={() => send.mutate({ id: data.id, email: sendEmail, whatsapp: sendWhatsapp })}
                className={buttonClass({ size: "sm", className: "mt-3" })}
              >
                {send.isPending ? <Spinner /> : <Send aria-hidden />}
                {data.sendCount > 0 ? "Send again" : "Send quotation"}
              </button>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {data.status === "draft" && (
              <button type="button" onClick={() => onEdit(data.id)} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <Pencil aria-hidden />
                Edit
              </button>
            )}
            {data.status !== "draft" && (
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                <Link2 aria-hidden />
                Copy guest link
              </button>
            )}
            {data.status !== "draft" && (
              <a href={`/quote/${data.id}/pdf`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                <Download aria-hidden />
                PDF
              </a>
            )}
            <button type="button" disabled={duplicate.isPending} onClick={() => duplicate.mutate(data.id)} className={buttonClass({ variant: "ghost", size: "sm" })}>
              <Copy aria-hidden />
              Duplicate
            </button>
            {canSend && (
              <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(data.id)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                <Ban aria-hidden />
                Cancel quotation
              </button>
            )}
          </div>

          {data.bookings.length > 0 && (
            <section>
              <h3 className="font-display text-lg">Bookings</h3>
              <ul className="mt-2 space-y-2">
                {data.bookings.map((booking) => {
                  const payment = paymentChip(booking.paymentStatus);
                  return (
                    <li key={booking.id}>
                      <button
                        type="button"
                        onClick={() => setBookingId(booking.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-3 py-2 text-left text-sm hover:bg-secondary/60"
                      >
                        <span>
                          {booking.roomName} <span className="font-mono text-xs text-accent">{booking.reference}</span>
                        </span>
                        <StatusChip tone={payment.tone}>{payment.label}</StatusChip>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <DocumentList quoteId={data.id} />

          <ol className="space-y-1 text-xs text-muted-foreground">
            <li>Written by {data.createdBy}</li>
            {data.sentAt && (
              <li>
                Sent {day(data.sentAt)}
                {data.sendCount > 1 ? ` (${data.sendCount} times)` : ""}
              </li>
            )}
            {data.viewedAt && <li>Opened {day(data.viewedAt)}</li>}
            {data.acceptedAt && <li>Accepted {day(data.acceptedAt)}</li>}
            {data.declinedAt && <li>Declined {day(data.declinedAt)}{data.declineReason ? `: ${data.declineReason}` : ""}</li>}
          </ol>
        </div>
      )}
      <BookingDrawer bookingId={bookingId} onClose={() => setBookingId(undefined)} />
    </Drawer>
  );
}
