-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "refundNote" TEXT,
ADD COLUMN     "refundStatus" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "refundedBy" TEXT;

-- CreateIndex
CREATE INDEX "booking_refundStatus_idx" ON "booking"("refundStatus");
