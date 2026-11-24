-- CreateTable
CREATE TABLE "expense_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "categoryId" TEXT,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "spentOn" TIMESTAMP(3) NOT NULL,
    "paidTo" TEXT,
    "method" TEXT NOT NULL DEFAULT 'cash',
    "reference" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_category_name_key" ON "expense_category"("name");

-- CreateIndex
CREATE INDEX "expense_propertyId_spentOn_idx" ON "expense"("propertyId", "spentOn");

-- CreateIndex
CREATE INDEX "expense_spentOn_idx" ON "expense"("spentOn");

-- CreateIndex
CREATE INDEX "expense_categoryId_idx" ON "expense"("categoryId");

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense" ADD CONSTRAINT "expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The usual categories to start with; the owner renames, adds or deletes them.
INSERT INTO "expense_category" ("id", "name") VALUES
  (gen_random_uuid()::text, 'Groceries & kitchen'),
  (gen_random_uuid()::text, 'Bar stock'),
  (gen_random_uuid()::text, 'Fuel & transport'),
  (gen_random_uuid()::text, 'Electricity'),
  (gen_random_uuid()::text, 'Water'),
  (gen_random_uuid()::text, 'Gas'),
  (gen_random_uuid()::text, 'Repairs & maintenance'),
  (gen_random_uuid()::text, 'Cleaning & laundry'),
  (gen_random_uuid()::text, 'Guest supplies'),
  (gen_random_uuid()::text, 'Internet & phones'),
  (gen_random_uuid()::text, 'Marketing'),
  (gen_random_uuid()::text, 'Bank & payment charges'),
  (gen_random_uuid()::text, 'Licences & levies'),
  (gen_random_uuid()::text, 'Other')
ON CONFLICT ("name") DO NOTHING;
