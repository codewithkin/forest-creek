-- CreateTable
CREATE TABLE "file_folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "propertyId" TEXT,
    "parentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_file" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "description" TEXT,
    "folderId" TEXT,
    "propertyId" TEXT,
    "bookingId" TEXT,
    "quoteId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deletedAt" TIMESTAMP(3),
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_share" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "maxDownloads" INTEGER,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "file_folder_propertyId_idx" ON "file_folder"("propertyId");

-- CreateIndex
CREATE INDEX "file_folder_parentId_idx" ON "file_folder"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_key_key" ON "stored_file"("key");

-- CreateIndex
CREATE INDEX "stored_file_propertyId_deletedAt_idx" ON "stored_file"("propertyId", "deletedAt");

-- CreateIndex
CREATE INDEX "stored_file_folderId_idx" ON "stored_file"("folderId");

-- CreateIndex
CREATE INDEX "stored_file_bookingId_idx" ON "stored_file"("bookingId");

-- CreateIndex
CREATE INDEX "stored_file_quoteId_idx" ON "stored_file"("quoteId");

-- CreateIndex
CREATE INDEX "stored_file_status_createdAt_idx" ON "stored_file"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "file_share_token_key" ON "file_share"("token");

-- CreateIndex
CREATE INDEX "file_share_fileId_idx" ON "file_share"("fileId");

-- AddForeignKey
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_folder" ADD CONSTRAINT "file_folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "file_folder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "file_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_share" ADD CONSTRAINT "file_share_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;
