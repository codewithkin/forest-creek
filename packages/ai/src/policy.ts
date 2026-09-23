import {
  BALANCE_DUE_DAYS,
  CANCELLATION_TIERS,
  CREDIT_VALIDITY_MONTHS,
  DEPOSIT_NON_REFUNDABLE,
  DEPOSIT_PERCENT,
  FREE_DATE_CHANGE_MIN_DAYS,
  FULL_PAYMENT_WITHIN_DAYS,
  GROUP_BALANCE_DUE_DAYS,
  HIGH_SEASON_CHANGE_FREEZE_DAYS,
  REFUND_BUSINESS_DAYS,
  REFUND_PROCESSING_FEE_PERCENT,
} from "@forest-creek/db/booking-policy";

import { policyPageUrl } from "./links";

type Tier = { minDays: number; feePercent: number };

function tierLines(tiers: Tier[]): string {
  return tiers
    .map((tier, index) => {
      const previous = tiers[index - 1];
      const when =
        index === 0
          ? `more than ${tier.minDays - 1} days before arrival`
          : tier.minDays === 0
            ? `less than ${previous!.minDays} days before arrival, or a no-show`
            : `${tier.minDays}-${previous!.minDays - 1} days before arrival`;
      const refund = tier.feePercent === 100 ? "no refund" : `${100 - tier.feePercent}% refunded`;
      return `  - Cancelled ${when}: ${tier.feePercent}% fee, ${refund}.`;
    })
    .join("\n");
}

/**
 * Forest Creek's Booking & Cancellation Policy as the assistants state it.
 * Generated from packages/db/src/booking-policy.ts — the rules the system
 * applies — so what a guest is told is exactly what happens. The evals give
 * the judge this same text as a sanctioned fact.
 */
export const policyText = `
Booking & Cancellation Policy (effective 1 January 2026, all rates in USD). Full text: ${policyPageUrl}
- A ${DEPOSIT_PERCENT}%${DEPOSIT_NON_REFUNDABLE ? " non-refundable" : ""} deposit secures a booking; the booking is confirmed once the deposit is received.
- Paying: online by Ecocash or OneMoney (a prompt on the guest's phone), or InnBucks or Visa/Mastercard on the booking's payment page, all through Paynow. Bank transfer or USD cash only by arrangement with the reservations team — the assistant never gives bank details itself.
- The balance is due ${BALANCE_DUE_DAYS} days before arrival (${GROUP_BALANCE_DUE_DAYS} days for groups of 5+ rooms or exclusive use). Booking within ${FULL_PAYMENT_WITHIN_DAYS} days of arrival means paying in full at booking.
- Low/shoulder season (January-May and November):
${tierLines(CANCELLATION_TIERS.low)}
- High season (June-October and 15 December-5 January), strict:
${tierLines(CANCELLATION_TIERS.high)}
  - High-season date changes are not permitted within ${HIGH_SEASON_CHANGE_FREEZE_DAYS} days of arrival and count as a cancellation.
- One free date change if asked more than ${FREE_DATE_CHANGE_MIN_DAYS} days before arrival (low season only), subject to availability and rate differences.
${
  DEPOSIT_NON_REFUNDABLE
    ? "- The deposit itself is never refunded: on cancellation Forest Creek keeps the higher of the fee and the deposit already paid, so only money paid beyond that can come back.\n"
    : ""
}- Early check-outs and no-shows get no refund for unused nights.
- Refunds go back to the original payment method within ${REFUND_BUSINESS_DAYS} business days, less a ${REFUND_PROCESSING_FEE_PERCENT}% processing fee; instead, the guest can take a free postponement within ${CREDIT_VALIDITY_MONTHS} months or a ${CREDIT_VALIDITY_MONTHS}-month credit voucher.
- Cancellations and date changes are handled by the reservations team, not by this chat.
`.trim();
