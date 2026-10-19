-- AlterTable
ALTER TABLE "booking" ADD COLUMN     "chatSessionId" TEXT;

-- AlterTable
ALTER TABLE "chat_message" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
