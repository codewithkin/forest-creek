// Import-free so it can be unit tested without a database or env.

export const invoiceStatuses = ["issued", "paid", "void"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** INV-2026-0007: the paper book's running number, with the year in front. */
export function invoiceNumber(number: number, createdAt: Date): string {
  return `INV-${createdAt.getUTCFullYear()}-${String(number).padStart(4, "0")}`;
}

/** Dollars as typed (12.5) to cents (1250), without float dust. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** A line's amount: quantity can be a fraction (1.5 hours), the amount is whole cents. */
export function lineAmountCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

/**
 * Sub-total, VAT and grand total, as the paper invoice has them. VAT is worked
 * on the sub-total once (not per line), and rounded to the cent.
 */
export function invoiceTotals(lines: readonly { amountCents: number }[], vatRate: number): { subtotalCents: number; vatCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const vatCents = Math.round((subtotalCents * vatRate) / 100);
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents };
}

/** What is still owed: never below zero, nothing on a void invoice. */
export function invoiceBalanceCents(invoice: { status: string; totalCents: number; paidCents: number }): number {
  if (invoice.status === "void") return 0;
  return Math.max(0, invoice.totalCents - invoice.paidCents);
}
