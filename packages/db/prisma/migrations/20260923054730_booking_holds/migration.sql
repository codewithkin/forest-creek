-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "reviewNote" TEXT;

-- CreateIndex
CREATE INDEX "booking_bookingStatus_holdExpiresAt_idx" ON "booking"("bookingStatus", "holdExpiresAt");
