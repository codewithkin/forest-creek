-- AlterTable
ALTER TABLE "employee" ADD COLUMN     "categoryId" TEXT;

-- AlterTable
ALTER TABLE "payslip" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "payroll_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_category_name_key" ON "payroll_category"("name");

-- CreateIndex
CREATE INDEX "employee_categoryId_idx" ON "employee"("categoryId");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "payroll_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

