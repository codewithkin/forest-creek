-- CreateTable
CREATE TABLE "receipt" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "paynowReference" TEXT,
    "note" TEXT,
    "paidToDate" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_number_key" ON "receipt"("number");

-- CreateIndex
CREATE INDEX "receipt_bookingId_issuedAt_idx" ON "receipt"("bookingId", "issuedAt");

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
