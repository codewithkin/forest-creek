-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "nightlyRates" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "room_rate_period" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "pricePerNight" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_rate_period_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_rate_period_roomId_startDate_idx" ON "room_rate_period"("roomId", "startDate");

-- AddForeignKey
ALTER TABLE "room_rate_period" ADD CONSTRAINT "room_rate_period_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
