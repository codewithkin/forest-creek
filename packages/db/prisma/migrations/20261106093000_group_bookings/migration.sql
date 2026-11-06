-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "groupRef" TEXT;

-- CreateIndex
CREATE INDEX "booking_groupRef_idx" ON "booking"("groupRef");

