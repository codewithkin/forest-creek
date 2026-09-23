-- CreateTable
CREATE TABLE "payment_event" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "source" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,
    "amount" TEXT,
    "paynowReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_event_bookingId_createdAt_idx" ON "payment_event"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_event_outcome_createdAt_idx" ON "payment_event"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
