-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "dayVisitBookingId" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "day_visit" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pricePerPerson" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "image" TEXT NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_visit_booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dayVisitId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "visitName" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "guests" INTEGER NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "note" TEXT,
    "pricePerPerson" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "staffNote" TEXT,
    "handledBy" TEXT,
    "handledAt" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'web',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_visit_booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "day_visit_propertyId_idx" ON "day_visit"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "day_visit_propertyId_slug_key" ON "day_visit"("propertyId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "day_visit_booking_reference_key" ON "day_visit_booking"("reference");

-- CreateIndex
CREATE INDEX "day_visit_booking_propertyId_visitDate_idx" ON "day_visit_booking"("propertyId", "visitDate");

-- CreateIndex
CREATE INDEX "day_visit_booking_status_idx" ON "day_visit_booking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dayVisitBookingId_event_recipient_key" ON "notification"("dayVisitBookingId", "event", "recipient");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_dayVisitBookingId_fkey" FOREIGN KEY ("dayVisitBookingId") REFERENCES "day_visit_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_visit" ADD CONSTRAINT "day_visit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_visit_booking" ADD CONSTRAINT "day_visit_booking_dayVisitId_fkey" FOREIGN KEY ("dayVisitId") REFERENCES "day_visit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_visit_booking" ADD CONSTRAINT "day_visit_booking_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every email is about exactly one thing: a stay or a day visit.
ALTER TABLE "notification" ADD CONSTRAINT "notification_one_subject_check"
  CHECK (num_nonnulls("bookingId", "dayVisitBookingId") = 1);
