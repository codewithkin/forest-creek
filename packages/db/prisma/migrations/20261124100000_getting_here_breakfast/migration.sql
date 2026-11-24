
-- AlterTable
ALTER TABLE "property" ADD COLUMN     "breakfastIncluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "directions" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "travelDistances" TEXT[] DEFAULT ARRAY[]::TEXT[];

