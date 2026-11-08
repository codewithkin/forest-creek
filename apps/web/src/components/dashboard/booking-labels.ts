import type { ChipTone } from "./ui/page";

/*
 * What a booking's states are called. Staff read these at a glance, so they
 * say what the state means, not the enum.
 */

type Chip = { label: string; tone: ChipTone };

const BOOKING: Record<string, Chip> = {
  // Nobody has paid: the room is not held and it is not income.
  pending: { label: "Maybe, unpaid", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "good" },
  cancelled: { label: "Cancelled", tone: "bad" },
  // An unpaid booking whose arrival day passed.
  expired: { label: "Unpaid, dates passed", tone: "neutral" },
};

export function bookingChip(booking: {
  bookingStatus: string;
  amountPaid: number;
  checkedInAt?: string | null;
  checkedOutAt?: string | null;
}): Chip {
  if (booking.bookingStatus === "confirmed" && booking.checkedOutAt) return { label: "Checked out", tone: "neutral" };
  if (booking.bookingStatus === "confirmed" && booking.checkedInAt) return { label: "In house", tone: "info" };
  // Money in but not confirmed: a payment that landed on dates someone else had secured.
  if (booking.bookingStatus === "pending" && booking.amountPaid > 0) return { label: "Paid, needs review", tone: "bad" };
  return BOOKING[booking.bookingStatus] ?? { label: booking.bookingStatus, tone: "neutral" };
}

const PAYMENT: Record<string, Chip> = {
  pending: { label: "Not paid", tone: "gold" },
  // Paynow has sent a charge to the guest's phone.
  processing: { label: "Charge sent", tone: "gold" },
  // The deposit is in and the stay confirmed; the balance is still due.
  partial: { label: "Deposit paid", tone: "info" },
  verified: { label: "Paid in full", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
};

export function paymentChip(status: string): Chip {
  return PAYMENT[status] ?? { label: status, tone: "neutral" };
}

export const paymentMethodNames: Record<string, string> = {
  ecocash: "EcoCash",
  onemoney: "OneMoney",
  innbucks: "InnBucks",
  visa: "Visa / Mastercard",
  paynow: "Paynow (other)",
  // Legacy: bookings made before mobile-money-only. Historical rows keep
  // whatever method they were made with rather than being rewritten.
  card: "Card",
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
  cash: "Cash (USD)",
};

export function channelName(channel: string): string {
  return { web: "Website", whatsapp: "WhatsApp", staff: "Staff", quote: "Quotation" }[channel] ?? channel;
}

export const sourceNames: Record<string, string> = {
  "walk-in": "Walk-in",
  phone: "Phone",
  email: "Email",
  agent: "Agent",
  other: "Other",
};
