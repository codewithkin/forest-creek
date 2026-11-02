-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "rateNote" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "booking_event" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_event_bookingId_createdAt_idx" ON "booking_event"("bookingId", "createdAt");

-- AddForeignKey
ALTER TABLE "booking_event" ADD CONSTRAINT "booking_event_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
