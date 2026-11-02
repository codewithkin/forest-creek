"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Copy, Download, Link2, Mail, MessageCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { buttonClass } from "@/components/brand/button";
import { Spinner } from "@/components/brand/spinner";
import { ErrorMessage, friendlyError, Skeleton } from "@/components/brand/state";
import { QuoteSheetView } from "@/components/quote/quote-sheet-view";
import { trpc } from "@/utils/trpc";

import { paymentChip } from "./booking-labels";
import { BookingDrawer } from "./booking-drawer";
import { DocumentList } from "./document-list";
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
  // A draft is issued first, so its PDF and link work; an open one just downloads.
  const issue = useMutation(
    trpc.quotes.issue.mutationOptions({
      onSuccess: async (_result, id) => {
        window.location.assign(`/quote/${id}/pdf`);
        await queryClient.invalidateQueries();
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

          <QuoteSheetView quote={data} className="animate-rise-in" />

          {canSend && (
            <section className="rounded-2xl border border-border/60 p-4">
              <h3 className="text-sm font-medium">{data.sendCount > 0 ? "Send it again" : "Send it to the guest"}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={send.isPending || !data.guestEmail}
                  title={data.guestEmail || "No email on this quotation"}
                  onClick={() => send.mutate({ id: data.id, email: true, whatsapp: false })}
                  className={buttonClass({ size: "sm" })}
                >
                  {send.isPending && send.variables?.email ? <Spinner /> : <Mail aria-hidden />}
                  Email
                </button>
                <button
                  type="button"
                  disabled={send.isPending || !data.guestPhone}
                  title={data.guestPhone || "No WhatsApp number on this quotation"}
                  onClick={() => send.mutate({ id: data.id, email: false, whatsapp: true })}
                  className={buttonClass({ size: "sm", variant: "secondary" })}
                >
                  {send.isPending && send.variables?.whatsapp ? <Spinner /> : <MessageCircle aria-hidden />}
                  WhatsApp
                </button>
              </div>
              <p className="mt-2 truncate text-xs text-muted-foreground">
                {[data.guestEmail, data.guestPhone].filter(Boolean).join(" · ") || "No email or number: download the PDF instead."}
              </p>
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
            <button
              type="button"
              disabled={issue.isPending}
              onClick={() => issue.mutate(data.id)}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              {issue.isPending ? <Spinner /> : <Download aria-hidden />}
              PDF
            </button>
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
