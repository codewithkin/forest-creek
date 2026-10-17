-- CreateTable
CREATE TABLE "pending_confirmation" (
    "id" TEXT NOT NULL,
    "guest" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_confirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_confirmation_guest_idx" ON "pending_confirmation"("guest");

-- CreateIndex
CREATE UNIQUE INDEX "pending_confirmation_guest_key_key" ON "pending_confirmation"("guest", "key");
