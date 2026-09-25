import { prisma } from "./client";

import type { Booking, Prisma, Receipt } from "../prisma/generated/client";

export type { Receipt };

type Tx = Prisma.TransactionClient;

export const receiptKinds = ["deposit", "balance", "full", "part"] as const;
export type ReceiptKind = (typeof receiptKinds)[number];

/** "FCR-2026-000042": the year it was issued and the never-reused sequence number. */
export function formatReceiptNumber(number: number, issuedAt: Date): string {
  return `FCR-${issuedAt.getUTCFullYear()}-${String(number).padStart(6, "0")}`;
}

/**
 * What this payment was, from what had been paid before it and after it:
 * the first payment that leaves a balance is the deposit, the one that clears
 * it is the balance, one payment covering everything is the full stay.
 */
export function receiptKind(paidBefore: number, paidAfter: number, total: number): ReceiptKind {
  if (paidBefore <= 0) return paidAfter >= total ? "full" : "deposit";
  return paidAfter >= total ? "balance" : "part";
}

/**
 * Issues the receipt for money just credited, inside the same transaction as
 * the credit — so there is exactly one receipt per credited payment, and a
 * receipt can never exist for money that was not recorded.
 */
export function issueReceipt(
  tx: Tx,
  input: {
    booking: Pick<Booking, "id" | "totalAmount">;
    paidBefore: number;
    amount: number;
    method: string;
    source: "paynow" | "manual";
    paynowReference?: string | null;
    note?: string | null;
  },
): Promise<Receipt> {
  const paidAfter = input.paidBefore + input.amount;
  return tx.receipt.create({
    data: {
      bookingId: input.booking.id,
      amount: input.amount,
      kind: receiptKind(input.paidBefore, paidAfter, input.booking.totalAmount),
      method: input.method,
      source: input.source,
      paynowReference: input.paynowReference ?? null,
      note: input.note ?? null,
      paidToDate: paidAfter,
      balanceAfter: Math.max(0, input.booking.totalAmount - paidAfter),
    },
  });
}

const METHOD_LABELS: Record<string, string> = {
  ecocash: "EcoCash",
  onemoney: "OneMoney",
  innbucks: "InnBucks",
  visa: "Visa / Mastercard",
  bank_transfer: "Bank transfer",
  cash: "USD cash",
};

const KIND_LABELS: Record<ReceiptKind, string> = {
  deposit: "Deposit (50%)",
  balance: "Balance",
  full: "Full payment",
  part: "Part payment",
};

/** Everything a receipt shows, in plain values the PDF and the pages can print. */
export type ReceiptView = {
  id: string;
  number: string;
  issuedAt: string;
  amount: number;
  kind: ReceiptKind;
  kindLabel: string;
  method: string;
  methodLabel: string;
  source: string;
  paynowReference: string | null;
  paidToDate: number;
  balanceAfter: number;
  currency: string;
  booking: {
    reference: string;
    guestName: string;
    roomName: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    guests: number;
    activityNames: string[];
    totalAmount: number;
    roomRate: number;
    subtotal: number;
    balanceDueDate: string | null;
  };
  property: {
    name: string;
    location: string;
    phone: string;
    email: string;
  };
};

/**
 * A receipt, by its unguessable id. Carries the guest's name (it is their
 * receipt) but never their email, phone or notes, like every other view a
 * link can reach.
 */
export async function getReceiptView(id: string): Promise<ReceiptView | null> {
  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: { booking: { include: { property: true } } },
  });
  if (!receipt) return null;
  const { booking } = receipt;
  const kind = (receiptKinds as readonly string[]).includes(receipt.kind)
    ? (receipt.kind as ReceiptKind)
    : "part";
  return {
    id: receipt.id,
    number: formatReceiptNumber(receipt.number, receipt.issuedAt),
    issuedAt: receipt.issuedAt.toISOString(),
    amount: receipt.amount,
    kind,
    kindLabel: KIND_LABELS[kind],
    method: receipt.method,
    methodLabel: METHOD_LABELS[receipt.method] ?? receipt.method,
    source: receipt.source,
    paynowReference: receipt.paynowReference,
    paidToDate: receipt.paidToDate,
    balanceAfter: receipt.balanceAfter,
    currency: booking.property.currency,
    booking: {
      reference: booking.reference,
      guestName: booking.guestName,
      roomName: booking.roomName,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      nights: booking.nights,
      guests: booking.guests,
      activityNames: booking.activityNames,
      totalAmount: booking.totalAmount,
      roomRate: booking.roomRate,
      subtotal: booking.subtotal,
      balanceDueDate:
        receipt.balanceAfter > 0 ? (booking.balanceDueAt?.toISOString().slice(0, 10) ?? null) : null,
    },
    property: {
      name: booking.property.name,
      location: booking.property.location,
      phone: booking.property.phone,
      email: booking.property.email,
    },
  };
}

export type ReceiptSummary = {
  id: string;
  number: string;
  issuedAt: string;
  amount: number;
  kindLabel: string;
  methodLabel: string;
};

/** A booking's receipts, oldest first — the list the payment page and dashboard show. */
export async function listReceipts(where: { bookingId: string } | { reference: string }): Promise<ReceiptSummary[]> {
  const receipts = await prisma.receipt.findMany({
    where:
      "bookingId" in where
        ? { bookingId: where.bookingId }
        : { booking: { reference: where.reference.trim().toUpperCase() } },
    orderBy: { issuedAt: "asc" },
  });
  return receipts.map((receipt) => {
    const kind = (receiptKinds as readonly string[]).includes(receipt.kind)
      ? (receipt.kind as ReceiptKind)
      : "part";
    return {
      id: receipt.id,
      number: formatReceiptNumber(receipt.number, receipt.issuedAt),
      issuedAt: receipt.issuedAt.toISOString(),
      amount: receipt.amount,
      kindLabel: KIND_LABELS[kind],
      methodLabel: METHOD_LABELS[receipt.method] ?? receipt.method,
    };
  });
}
