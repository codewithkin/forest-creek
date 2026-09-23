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
  lodgeToday,
  paymentPlan,
  REFUND_BUSINESS_DAYS,
  REFUND_PROCESSING_FEE_PERCENT,
} from "@forest-creek/db";
import { z } from "zod";

import { publicProcedure, router } from "../index";

/**
 * The Booking & Cancellation Policy for the web app, which does not depend on
 * packages/db: the policy page and the booking form read the same numbers the
 * server applies, so they cannot disagree.
 */
export const policyRouter = router({
  terms: publicProcedure.query(() => ({
    effectiveDate: "2026-01-01",
    depositPercent: DEPOSIT_PERCENT,
    depositNonRefundable: DEPOSIT_NON_REFUNDABLE,
    balanceDueDays: BALANCE_DUE_DAYS,
    groupBalanceDueDays: GROUP_BALANCE_DUE_DAYS,
    fullPaymentWithinDays: FULL_PAYMENT_WITHIN_DAYS,
    tiers: CANCELLATION_TIERS,
    freeDateChangeMinDays: FREE_DATE_CHANGE_MIN_DAYS,
    highSeasonChangeFreezeDays: HIGH_SEASON_CHANGE_FREEZE_DAYS,
    refundProcessingFeePercent: REFUND_PROCESSING_FEE_PERCENT,
    refundBusinessDays: REFUND_BUSINESS_DAYS,
    creditValidityMonths: CREDIT_VALIDITY_MONTHS,
  })),

  /** What a stay of this total, arriving then, needs now and later — for the booking form. */
  plan: publicProcedure
    .input(z.object({ total: z.number().int().min(0).max(1_000_000), checkIn: z.iso.date() }))
    .query(({ input }) => paymentPlan(input.total, input.checkIn, lodgeToday())),
});
