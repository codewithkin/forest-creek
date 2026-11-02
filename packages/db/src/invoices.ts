import { env } from "@forest-creek/env/server";
import { z } from "zod";

import { toStayDate } from "./bookings";
import { prisma } from "./client";
import { describeError } from "./log";
import { invoiceBalanceCents, invoiceNumber, invoiceTotals, lineAmountCents, toCents } from "./invoice-rules";
import { renderInvoiceEmail } from "./notification-templates";

import type { Invoice, InvoiceLine, Prisma } from "../prisma/generated/client";

export * from "./invoice-rules";

/**
 * Invoices: the lodge's paper invoice book (To, date, REF No., quantity,
 * description, unit, total, sub-total, VAT, grand total, prepared by) made
 * digital. An invoice keeps its own copy of everything it says, and is voided,
 * never deleted. Money is in cents.
 */

export class InvoiceError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
  ) {
    super(message);
    this.name = "InvoiceError";
  }
}

const lineSchema = z.object({
  description: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(200).optional(),
  quantity: z.number().positive().max(10_000),
  /** Dollars, as typed. A discount is a negative line. */
  unitPrice: z.number().min(-1_000_000).max(1_000_000),
});

export const invoiceInputSchema = z.object({
  propertyId: z.string().min(1),
  bookingId: z.string().min(1).optional(),
  billedTo: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).optional(),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).default(""),
  phone: z.string().trim().max(40).optional(),
  reference: z.string().trim().max(80).optional(),
  issuedOn: z.iso.date(),
  dueOn: z.iso.date().optional(),
  vatRate: z.number().min(0).max(100).default(0),
  /** Dollars already received against it. */
  paid: z.number().min(0).max(10_000_000).default(0),
  notes: z.string().trim().max(1000).optional(),
  preparedBy: z.string().trim().max(120).optional(),
  lines: z.array(lineSchema).min(1, "Add at least one item").max(60),
});

export type InvoiceInput = z.input<typeof invoiceInputSchema>;

function buildLines(lines: z.output<typeof lineSchema>[]) {
  return lines.map((line, sortOrder) => {
    const unitPriceCents = toCents(line.unitPrice);
    return {
      description: line.description,
      detail: line.detail,
      quantity: line.quantity,
      unitPriceCents,
      amountCents: lineAmountCents(line.quantity, unitPriceCents),
      sortOrder,
    };
  });
}

export async function createInvoice(input: InvoiceInput, by: { email: string; name?: string | null }): Promise<Invoice> {
  const data = invoiceInputSchema.parse(input);
  const lines = buildLines(data.lines);
  const totals = invoiceTotals(lines, data.vatRate);
  if (totals.totalCents < 0) throw new InvoiceError("The total can't be below zero", "BAD_REQUEST");
  const paidCents = Math.min(toCents(data.paid), totals.totalCents);
  if (data.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId }, select: { propertyId: true } });
    if (!booking || booking.propertyId !== data.propertyId) throw new InvoiceError("That booking belongs to another property", "BAD_REQUEST");
  }
  return prisma.invoice.create({
    data: {
      propertyId: data.propertyId,
      bookingId: data.bookingId,
      billedTo: data.billedTo,
      company: data.company || null,
      email: data.email,
      phone: data.phone || null,
      reference: data.reference || null,
      issuedOn: toStayDate(data.issuedOn),
      dueOn: data.dueOn ? toStayDate(data.dueOn) : null,
      vatRate: data.vatRate,
      ...totals,
      paidCents,
      status: totals.totalCents > 0 && paidCents >= totals.totalCents ? "paid" : "issued",
      notes: data.notes || null,
      preparedBy: data.preparedBy || by.name || by.email,
      createdBy: by.email,
      lines: { create: lines },
    },
  });
}

const PROPERTY_FIELDS = { name: true, location: true, phone: true, email: true } as const;

function viewOf(invoice: Invoice & { lines: InvoiceLine[]; property: { name: string; location: string; phone: string; email: string } }) {
  return {
    id: invoice.id,
    label: invoiceNumber(invoice.number, invoice.createdAt),
    status: invoice.status,
    propertyId: invoice.propertyId,
    bookingId: invoice.bookingId,
    billedTo: invoice.billedTo,
    company: invoice.company,
    email: invoice.email,
    phone: invoice.phone,
    reference: invoice.reference,
    issuedOn: invoice.issuedOn.toISOString().slice(0, 10),
    dueOn: invoice.dueOn?.toISOString().slice(0, 10) ?? null,
    vatRate: invoice.vatRate,
    subtotalCents: invoice.subtotalCents,
    vatCents: invoice.vatCents,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    balanceCents: invoiceBalanceCents(invoice),
    notes: invoice.notes,
    preparedBy: invoice.preparedBy,
    sendCount: invoice.sendCount,
    sentAt: invoice.sentAt?.toISOString() ?? null,
    createdBy: invoice.createdBy,
    property: invoice.property,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      description: line.description,
      detail: line.detail,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      amountCents: line.amountCents,
    })),
  };
}

export type InvoiceView = ReturnType<typeof viewOf>;

/** Everything about one invoice. Its id is unguessable, so it is also the PDF's key. */
export async function getInvoice(id: string): Promise<InvoiceView | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } }, property: { select: PROPERTY_FIELDS } },
  });
  return invoice ? viewOf(invoice) : null;
}

export const listInvoicesSchema = z.object({
  status: z.enum(["issued", "paid", "void", "unpaid"]).optional(),
  search: z.string().trim().max(120).optional(),
});

export async function listInvoices(input: z.input<typeof listInvoicesSchema>, propertyIds?: string[]) {
  const { status, search } = listInvoicesSchema.parse(input);
  const number = search?.match(/(\d{1,6})\s*$/)?.[1];
  const where: Prisma.InvoiceWhereInput = {
    ...(propertyIds ? { propertyId: { in: propertyIds } } : {}),
    ...(status === "unpaid" ? { status: "issued" } : status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { billedTo: { contains: search, mode: "insensitive" } },
            { company: { contains: search, mode: "insensitive" } },
            { reference: { contains: search, mode: "insensitive" } },
            ...(number ? [{ number: Number(number) }] : []),
          ],
        }
      : {}),
  };
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { number: "desc" },
    take: 500,
    include: { property: { select: { name: true } } },
  });
  return invoices.map((invoice) => ({
    id: invoice.id,
    label: invoiceNumber(invoice.number, invoice.createdAt),
    status: invoice.status,
    billedTo: invoice.billedTo,
    company: invoice.company,
    reference: invoice.reference,
    issuedOn: invoice.issuedOn.toISOString().slice(0, 10),
    totalCents: invoice.totalCents,
    balanceCents: invoiceBalanceCents(invoice),
    propertyName: invoice.property.name,
  }));
}

/** The page's headline figures: billed this month, still owed, and how many are open. */
export async function getInvoiceStats(propertyIds?: string[], today: Date = new Date()) {
  const scope = propertyIds ? { propertyId: { in: propertyIds } } : {};
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [month, open] = await Promise.all([
    prisma.invoice.aggregate({ where: { ...scope, status: { not: "void" }, issuedOn: { gte: monthStart } }, _sum: { totalCents: true }, _count: true }),
    prisma.invoice.findMany({ where: { ...scope, status: "issued" }, select: { status: true, totalCents: true, paidCents: true } }),
  ]);
  return {
    billedThisMonthCents: month._sum.totalCents ?? 0,
    issuedThisMonth: month._count,
    outstandingCents: open.reduce((sum, invoice) => sum + invoiceBalanceCents(invoice), 0),
    unpaidCount: open.filter((invoice) => invoiceBalanceCents(invoice) > 0).length,
  };
}

/** The property each invoice belongs to, for the API's access check. */
export async function invoiceProperties(ids: string[]): Promise<string[]> {
  const rows = await prisma.invoice.findMany({ where: { id: { in: ids } }, select: { propertyId: true } });
  if (rows.length !== new Set(ids).size) throw new InvoiceError("Some of those invoices no longer exist", "NOT_FOUND");
  return [...new Set(rows.map((row) => row.propertyId))];
}

/** Paid in full (what was received becomes the total), or back to unpaid. Void ones are left alone. */
export async function setInvoicesPaid(ids: string[], paid: boolean): Promise<{ changed: number }> {
  if (!paid) {
    const { count } = await prisma.invoice.updateMany({ where: { id: { in: ids }, status: "paid" }, data: { status: "issued", paidCents: 0 } });
    return { changed: count };
  }
  const open = await prisma.invoice.findMany({ where: { id: { in: ids }, status: "issued" }, select: { id: true, totalCents: true } });
  await prisma.$transaction(open.map((invoice) => prisma.invoice.update({ where: { id: invoice.id }, data: { status: "paid", paidCents: invoice.totalCents } })));
  return { changed: open.length };
}

/** Cancelled for good, kept for the record: an invoice is never deleted. */
export async function voidInvoices(ids: string[]): Promise<{ changed: number }> {
  const { count } = await prisma.invoice.updateMany({ where: { id: { in: ids }, status: { not: "void" } }, data: { status: "void" } });
  return { changed: count };
}

/**
 * An invoice's starting point from a stay: who, the reference, the room for
 * its nights, the experiences, and what has been paid. Staff check and issue it.
 */
export async function invoiceDraftFromBooking(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new InvoiceError("No such booking", "NOT_FOUND");
  const day = (date: Date) => date.toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const detail = `${day(booking.checkIn)} to ${day(booking.checkOut)} · ${booking.guests} ${booking.guests === 1 ? "guest" : "guests"}`;
  // A stay priced evenly reads as nights × rate; anything else as one line for the stay.
  const even = booking.nights > 0 && booking.roomRate * booking.nights === booking.subtotal;
  const lines: z.input<typeof lineSchema>[] = [
    even
      ? { description: booking.roomName, detail, quantity: booking.nights, unitPrice: booking.roomRate }
      : { description: `${booking.roomName}, ${booking.nights} ${booking.nights === 1 ? "night" : "nights"}`, detail, quantity: 1, unitPrice: booking.subtotal },
  ];
  const extras = booking.totalAmount - booking.subtotal;
  if (extras > 0) lines.push({ description: booking.activityNames.length ? booking.activityNames.join(", ") : "Extras", quantity: 1, unitPrice: extras });
  if (extras < 0) lines.push({ description: booking.rateNote ?? "Discount", quantity: 1, unitPrice: extras });
  return {
    propertyId: booking.propertyId,
    bookingId: booking.id,
    billedTo: booking.guestName,
    email: booking.guestEmail,
    phone: booking.guestPhone ?? undefined,
    reference: booking.reference,
    paid: booking.amountPaid,
    lines,
  };
}

export function invoicePdfUrl(id: string): string {
  return new URL(`/invoice/${id}/pdf`, env.CORS_ORIGIN).toString();
}

/**
 * Emails the invoice through the outbox (sent by the API's worker, retried
 * like every email). A repeat send is a new message. Never throws.
 */
export async function queueInvoiceEmail(id: string): Promise<{ queued: boolean; problem?: string }> {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { property: { select: { name: true, phone: true } } } });
    if (!invoice) return { queued: false, problem: "No such invoice" };
    if (!invoice.email) return { queued: false, problem: "There is no email address on this invoice." };
    if (invoice.status === "void") return { queued: false, problem: "A void invoice isn't sent." };
    const message = renderInvoiceEmail(
      { ...invoice, label: invoiceNumber(invoice.number, invoice.createdAt), propertyName: invoice.property.name },
      { contactPhone: invoice.property.phone, pdfUrl: invoicePdfUrl(id) },
    );
    const sendNumber = invoice.sendCount + 1;
    const { document, ...rest } = message;
    await prisma.$transaction([
      prisma.notification.create({ data: { ...rest, content: document, event: "invoice", dedupeKey: `invoice:${id}:${sendNumber}` } }),
      prisma.invoice.update({ where: { id }, data: { sendCount: sendNumber, sentAt: new Date() } }),
    ]);
    return { queued: true };
  } catch (error) {
    console.error(`[notifications] could not queue invoice ${id}: ${describeError(error)}`);
    return { queued: false, problem: "The email couldn't be queued. Try again." };
  }
}
