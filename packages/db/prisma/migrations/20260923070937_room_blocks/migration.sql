-- CreateTable
CREATE TABLE "room_block" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_block_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_block_roomId_startDate_idx" ON "room_block"("roomId", "startDate");

-- AddForeignKey
ALTER TABLE "room_block" ADD CONSTRAINT "room_block_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
