"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Download, FileText, Link2 } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

type ReceiptSummary = {
  id: string;
  number: string;
  issuedAt: string;
  amount: number;
  kindLabel: string;
  methodLabel: string;
};

function issued(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: "Africa/Harare",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CopyLink({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/receipt/${id}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Link2 aria-hidden className="size-3.5" />}
      {copied ? "Copied" : "Link"}
    </button>
  );
}

/**
 * The receipts themselves: a row per payment with its PDF download. `copyable`
 * adds the link to paste to a guest on WhatsApp — staff only.
 */
export function ReceiptRows({
  receipts,
  compact = false,
  copyable = false,
}: {
  receipts: ReceiptSummary[];
  compact?: boolean;
  copyable?: boolean;
}) {
  return (
    <ul className={compact ? "space-y-1.5" : "space-y-2"}>
      {receipts.map((receipt) => (
        <li
          key={receipt.id}
          className={`flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/40 ${
            compact ? "px-3 py-2" : "px-4 py-3"
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileText aria-hidden className="size-4 shrink-0 text-accent" />
            <div className="min-w-0 text-left">
              <p className="truncate font-mono text-xs tracking-wider">{receipt.number}</p>
              <p className="text-xs text-muted-foreground">
                ${receipt.amount} · {receipt.kindLabel} · {receipt.methodLabel} · {issued(receipt.issuedAt)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {copyable && <CopyLink id={receipt.id} />}
            <a
              href={`/receipt/${receipt.id}`}
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Download aria-hidden className="size-3.5" />
              PDF
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A booking's receipts for the guest, by the reference they already hold.
 * Renders nothing until there is a receipt. `watch` keeps it checking while a
 * payment has just landed, since the receipt is issued a moment after.
 */
export function ReceiptList({ reference, watch = false }: { reference: string; watch?: boolean }) {
  const receipts = useQuery({
    ...trpc.receipts.forReference.queryOptions(reference),
    refetchInterval: (query) => (watch && (query.state.data?.length ?? 0) === 0 ? 3000 : false),
  });
  if (!receipts.data || receipts.data.length === 0) return null;
  return (
    <section className="mt-8 text-left" aria-labelledby="receipts-heading">
      <h3 id="receipts-heading" className="font-display text-xl">
        Your receipts
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Download a branded PDF for each payment — keep it with your booking reference.
      </p>
      <div className="mt-4">
        <ReceiptRows receipts={receipts.data} />
      </div>
    </section>
  );
}
