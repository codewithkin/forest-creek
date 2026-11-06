-- CreateTable
CREATE TABLE "employee" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "idNumber" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "startDate" TIMESTAMP(3),
    "baseSalaryCents" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL DEFAULT 'cash',
    "paymentDetails" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_run" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "period" TEXT NOT NULL,
    "propertyId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "position" TEXT,
    "basicCents" INTEGER NOT NULL,
    "allowancesCents" INTEGER NOT NULL DEFAULT 0,
    "overtimeCents" INTEGER NOT NULL DEFAULT 0,
    "deductionsCents" INTEGER NOT NULL DEFAULT 0,
    "deductionNote" TEXT,
    "netCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "reference" TEXT,
    "signature" TEXT,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_propertyId_active_idx" ON "employee"("propertyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "pay_run_number_key" ON "pay_run"("number");

-- CreateIndex
CREATE INDEX "pay_run_period_idx" ON "pay_run"("period");

-- CreateIndex
CREATE INDEX "payslip_employeeId_idx" ON "payslip"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_payRunId_employeeId_key" ON "payslip"("payRunId", "employeeId");

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_run" ADD CONSTRAINT "pay_run_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "pay_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

