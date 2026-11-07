-- AlterTable
ALTER TABLE "letter" ADD COLUMN     "signature" TEXT,
ADD COLUMN     "stamped" BOOLEAN NOT NULL DEFAULT true;

