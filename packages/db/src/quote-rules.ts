// Import-free so it can be unit tested without a database or env.

export const quoteStatuses = ["draft", "sent", "viewed", "accepted", "declined", "expired", "cancelled"] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

/** Out with the guest, and can still be accepted. */
export const OPEN_STATUSES = ["sent", "viewed"] as const;

export function isOpen(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** FCQ-2026-000123, like a receipt's number. */
export function quoteNumber(number: number, createdAt: Date): string {
  return `FCQ-${createdAt.getUTCFullYear()}-${String(number).padStart(6, "0")}`;
}

export function quoteTotals(lines: readonly { amount: number }[], discount: number): { subtotal: number; total: number } {
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  return { subtotal, total: subtotal - discount };
}

/**
 * Takes a discount off a run of bookings in order, never below zero, so a
 * discount larger than the first room's stay carries on to the next.
 */
export function spreadDiscount(amounts: readonly number[], discount: number): number[] {
  let left = discount;
  return amounts.map((amount) => {
    const taken = Math.min(left, amount);
    left -= taken;
    return taken;
  });
}

/**
 * A number as WhatsApp knows it: digits with the country code. A local 077…
 * becomes 26377…. Anything too short to be a phone is refused.
 */
export function whatsappDigits(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, "");
  const full = digits.startsWith("00") ? digits.slice(2) : digits.startsWith("0") ? `263${digits.slice(1)}` : digits;
  return full.length >= 10 && full.length <= 15 ? full : undefined;
}
