/**
 * Forest Creek Lodge's Booking & Cancellation Policy (effective 1 Jan 2026),
 * as rules. Import-free, so every clause is unit tested, and the ONE place the
 * numbers live: the booking flow, the dashboard, the emails, the policy page
 * and the AI agents all read them from here, so what a guest is told and what
 * the system does cannot drift apart.
 *
 * Dates are plain YYYY-MM-DD calendar days in Zimbabwe; money is whole USD in,
 * cents out where a percentage can leave a fraction.
 */

// ---- 1. Booking confirmation & payment ------------------------------------

/** Share of the stay taken as a deposit to secure the booking. */
export const DEPOSIT_PERCENT = 50;

/**
 * Clause 1 calls the deposit non-refundable, while clauses 2-3 refund up to
 * 90% of a cancelled stay. Read literally, both hold: whatever the tier, the
 * deposit (once paid) is kept. Flip this if Forest Creek means the tiers to
 * override the deposit rule. See cancellationQuote.
 */
export const DEPOSIT_NON_REFUNDABLE = true;

/** The balance is due this many days before arrival. */
export const BALANCE_DUE_DAYS = 14;

/**
 * Groups of 5+ rooms or exclusive use pay the balance this many days before
 * arrival. Bookings in this app are one room each, so nothing applies it yet.
 */
export const GROUP_BALANCE_DUE_DAYS = 30;

/** Booked within this many days of arrival: full payment at booking. */
export const FULL_PAYMENT_WITHIN_DAYS = 14;

// ---- 2-3. Seasons and cancellation tiers ----------------------------------

export type Season = "high" | "low";

/**
 * High season: June to October, and 15 December to 5 January. Everything else
 * is low/shoulder season (January-May and November, per the policy).
 *
 * Two gaps in the document, decided here: 1-5 January is in both lists and is
 * treated as high (the stricter, more specific clause); 1-14 December is in
 * neither and is treated as low.
 */
export function seasonOf(day: string): Season {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  if (month >= 6 && month <= 10) return "high";
  if (month === 12 && date >= 15) return "high";
  if (month === 1 && date <= 5) return "high";
  return "low";
}

type Tier = { /** Applies when at least this many days remain. */ minDays: number; feePercent: number };

/** Ordered from the earliest cancellation to the latest. */
export const CANCELLATION_TIERS: Record<Season, Tier[]> = {
  low: [
    { minDays: 31, feePercent: 10 }, // more than 30 days
    { minDays: 15, feePercent: 50 }, // 15-30 days
    { minDays: 7, feePercent: 75 }, // 7-14 days
    { minDays: 0, feePercent: 100 }, // less than 7 days, or no-show
  ],
  high: [
    { minDays: 46, feePercent: 25 }, // more than 45 days
    { minDays: 30, feePercent: 75 }, // 30-45 days
    { minDays: 0, feePercent: 100 }, // less than 30 days, or no-show
  ],
};

// ---- 4. Amendments ---------------------------------------------------------

/** A free date change must be asked for more than this many days out (low season). */
export const FREE_DATE_CHANGE_MIN_DAYS = 21;
/** High-season date changes within this many days are refused (= a cancellation). */
export const HIGH_SEASON_CHANGE_FREEZE_DAYS = 30;

// ---- 5. Refunds -------------------------------------------------------------

export const REFUND_PROCESSING_FEE_PERCENT = 5;
export const REFUND_BUSINESS_DAYS = 14;
/** Months a postponement or credit voucher may be used within, instead of a refund. */
export const CREDIT_VALIDITY_MONTHS = 12;

// ---- Calculations -----------------------------------------------------------

const DAY_MS = 86_400_000;

function utcDay(day: string): number {
  return Date.parse(day + "T00:00:00Z");
}

/** Whole calendar days from `from` to `to` (negative once `to` has passed). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function addDays(day: string, days: number): string {
  return new Date(utcDay(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Today's date in Zimbabwe, which is what "days before arrival" counts from. */
export function lodgeToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Africa/Harare" });
}

export type PaymentPlan = {
  total: number;
  /** What secures the booking. Equals total when full payment is due now. */
  depositAmount: number;
  balanceAmount: number;
  /** True when booked within FULL_PAYMENT_WITHIN_DAYS of arrival. */
  fullPaymentRequired: boolean;
  /** YYYY-MM-DD the balance is due, or null when there is none. */
  balanceDueDate: string | null;
};

/**
 * What a guest pays and when, decided at booking. The deposit is rounded up
 * to a whole dollar so every charge is whole dollars.
 */
export function paymentPlan(total: number, checkIn: string, today: string): PaymentPlan {
  const fullPaymentRequired = daysBetween(today, checkIn) <= FULL_PAYMENT_WITHIN_DAYS;
  const depositAmount = fullPaymentRequired ? total : Math.ceil((total * DEPOSIT_PERCENT) / 100);
  const balanceAmount = total - depositAmount;
  return {
    total,
    depositAmount,
    balanceAmount,
    fullPaymentRequired,
    balanceDueDate: balanceAmount > 0 ? addDays(checkIn, -BALANCE_DUE_DAYS) : null,
  };
}

/** The fee tier for cancelling `daysBeforeArrival` days out (a no-show is 0). */
export function cancellationFeePercent(season: Season, daysBeforeArrival: number): number {
  const tier = CANCELLATION_TIERS[season].find((candidate) => daysBeforeArrival >= candidate.minDays);
  return tier?.feePercent ?? 100;
}

export type CancellationQuote = {
  season: Season;
  daysBeforeArrival: number;
  feePercent: number;
  /** The tier's fee on the whole stay, USD. */
  fee: number;
  /** The deposit kept whatever the tier (clause 1), USD. */
  nonRefundableDeposit: number;
  /** What Forest Creek keeps of what was paid, USD. */
  retained: number;
  /** Paid minus retained, before the refund processing fee, USD. */
  refundable: number;
  processingFee: number;
  /** What actually goes back to the guest, in cents. */
  refundCents: number;
};

/**
 * What cancelling costs, given what has been paid. The tier's fee is a share of
 * the whole stay; the deposit already paid is kept regardless (clause 1, while
 * DEPOSIT_NON_REFUNDABLE); whatever of the payments is left comes back less
 * the 5% processing fee (clause 5). A no-show is a cancellation on the day.
 */
export function cancellationQuote(input: {
  total: number;
  amountPaid: number;
  checkIn: string;
  /** The day the guest cancelled, YYYY-MM-DD in Zimbabwe. */
  cancelledOn: string;
  noShow?: boolean;
}): CancellationQuote {
  const season = seasonOf(input.checkIn);
  const daysBeforeArrival = input.noShow ? 0 : Math.max(0, daysBetween(input.cancelledOn, input.checkIn));
  const feePercent = cancellationFeePercent(season, daysBeforeArrival);
  const fee = (input.total * feePercent) / 100;
  // Always 50% of the stay — not the booking's depositAmount, which is the
  // whole stay when it was booked within 14 days and paid in full up front.
  const nonRefundableDeposit = DEPOSIT_NON_REFUNDABLE
    ? Math.min(input.amountPaid, Math.ceil((input.total * DEPOSIT_PERCENT) / 100))
    : 0;
  const retained = Math.min(input.amountPaid, Math.max(fee, nonRefundableDeposit));
  const refundable = Math.max(0, input.amountPaid - retained);
  const refundableCents = Math.round(refundable * 100);
  const processingFeeCents = Math.round((refundableCents * REFUND_PROCESSING_FEE_PERCENT) / 100);
  return {
    season,
    daysBeforeArrival,
    feePercent,
    fee: round2(fee),
    nonRefundableDeposit,
    retained: round2(retained),
    refundable: round2(refundable),
    processingFee: processingFeeCents / 100,
    refundCents: refundableCents - processingFeeCents,
  };
}

export type DateChangeVerdict =
  | { kind: "free"; reason: string }
  | { kind: "not-free"; reason: string }
  | { kind: "refused"; reason: string };

/**
 * Clause 4 and the last line of clause 3. One free change, low season only,
 * asked for more than 21 days out; in high season a change within 30 days is
 * not permitted and counts as a cancellation. Anything else is not covered by
 * the free allowance — staff may still agree it, but it is their call.
 */
export function dateChangeVerdict(input: {
  checkIn: string;
  requestedOn: string;
  changesUsed: number;
}): DateChangeVerdict {
  const season = seasonOf(input.checkIn);
  const days = daysBetween(input.requestedOn, input.checkIn);
  if (season === "high" && days < HIGH_SEASON_CHANGE_FREEZE_DAYS) {
    return {
      kind: "refused",
      reason: `High-season date changes are not permitted within ${HIGH_SEASON_CHANGE_FREEZE_DAYS} days of arrival and are treated as a cancellation.`,
    };
  }
  if (season === "low" && days > FREE_DATE_CHANGE_MIN_DAYS && input.changesUsed === 0) {
    return {
      kind: "free",
      reason: "One free date change, requested more than 21 days before a low-season arrival.",
    };
  }
  return {
    kind: "not-free",
    reason:
      input.changesUsed > 0
        ? "The one free date change has already been used."
        : season === "high"
          ? "Free date changes apply to low-season stays only."
          : `Free date changes must be requested more than ${FREE_DATE_CHANGE_MIN_DAYS} days before arrival.`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "$1,234" or "$12.50" — whole dollars stay whole. */
export function usd(amount: number): string {
  return (
    "$" +
    amount.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * What the next charge should be. Before anything is paid that is the deposit
 * (or the whole stay, if the guest would rather pay in full); after, whatever
 * of the stay is left. Bookings from before the policy have no deposit on
 * record and were always paid in full.
 */
export function amountDueNow(
  booking: { totalAmount: number; amountPaid: number; depositAmount: number | null },
  payInFull = false,
): number {
  const outstanding = Math.max(0, booking.totalAmount - booking.amountPaid);
  if (booking.amountPaid === 0 && !payInFull) {
    return Math.min(outstanding, booking.depositAmount ?? booking.totalAmount);
  }
  return outstanding;
}
