-- CreateTable
CREATE TABLE "guest_registration" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "propertyId" TEXT NOT NULL,
    "bookingId" TEXT,
    "guestName" TEXT NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "childrenAges" TEXT,
    "nationality" TEXT,
    "idNumber" TEXT,
    "passportNumber" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone" TEXT,
    "phoneWork" TEXT,
    "email" TEXT,
    "carRegistration" TEXT,
    "roomName" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "receiptNumber" TEXT,
    "paymentMethod" TEXT,
    "conditions" TEXT NOT NULL,
    "signature" TEXT,
    "signedAt" TIMESTAMP(3),
    "receptionist" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "propertyId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "closing" TEXT NOT NULL DEFAULT 'Yours faithfully',
    "signerName" TEXT NOT NULL,
    "signerTitle" TEXT,
    "letterDate" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_registration_number_key" ON "guest_registration"("number");

-- CreateIndex
CREATE INDEX "guest_registration_propertyId_checkIn_idx" ON "guest_registration"("propertyId", "checkIn");

-- CreateIndex
CREATE INDEX "guest_registration_bookingId_idx" ON "guest_registration"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_number_key" ON "letter"("number");

-- CreateIndex
CREATE INDEX "letter_propertyId_letterDate_idx" ON "letter"("propertyId", "letterDate");

-- AddForeignKey
ALTER TABLE "guest_registration" ADD CONSTRAINT "guest_registration_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_registration" ADD CONSTRAINT "guest_registration_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter" ADD CONSTRAINT "letter_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

