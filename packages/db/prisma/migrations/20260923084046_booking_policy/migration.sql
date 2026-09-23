-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "amountPaid" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "balanceDueAt" TIMESTAMP(3),
ADD COLUMN     "dateChanges" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "depositAmount" INTEGER,
ADD COLUMN     "paynowChargeAmount" INTEGER,
ADD COLUMN     "policyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "refundAmountCents" INTEGER;

-- Bookings from before the policy were charged in full: record what was paid.
UPDATE "booking" SET "amountPaid" = "totalAmount" WHERE "paymentStatus" = 'verified';
