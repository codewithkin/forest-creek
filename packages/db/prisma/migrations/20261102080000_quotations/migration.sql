-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "quoteId" TEXT;
-- AlterTable
ALTER TABLE "notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "quoteId" TEXT;
-- CreateTable
CREATE TABLE "quote" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "propertyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT NOT NULL DEFAULT '',
    "guestPhone" TEXT,
    "company" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "discountNote" TEXT,
    "total" INTEGER NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "problem" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "quote_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "quote_line" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "roomId" TEXT,
    "description" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "guests" INTEGER,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "quote_line_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "quote_number_key" ON "quote"("number");
-- CreateIndex
CREATE INDEX "quote_propertyId_status_idx" ON "quote"("propertyId", "status");
-- CreateIndex
CREATE INDEX "quote_status_validUntil_idx" ON "quote"("status", "validUntil");
-- CreateIndex
CREATE INDEX "quote_line_quoteId_idx" ON "quote_line"("quoteId");
-- CreateIndex
CREATE INDEX "booking_quoteId_idx" ON "booking"("quoteId");
-- CreateIndex
CREATE UNIQUE INDEX "notification_dedupeKey_key" ON "notification"("dedupeKey");
-- CreateIndex
CREATE UNIQUE INDEX "notification_quoteId_event_recipient_key" ON "notification"("quoteId", "event", "recipient");
-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "quote" ADD CONSTRAINT "quote_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
