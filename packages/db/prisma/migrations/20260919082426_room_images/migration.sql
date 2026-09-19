-- AlterTable
ALTER TABLE "room" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: every existing room's single image becomes its one-photo gallery.
UPDATE "room" SET "images" = ARRAY["image"] WHERE "image" <> '' AND cardinality("images") = 0;
