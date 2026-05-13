-- Per-staff material budgets, assignment handover confirmation by warehouse
-- staff, and movement type HANDOVER_CONFIRMED for audit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PrivateCompanyMaterialMovementType'
      AND e.enumlabel = 'HANDOVER_CONFIRMED'
  ) THEN
    ALTER TYPE "PrivateCompanyMaterialMovementType" ADD VALUE 'HANDOVER_CONFIRMED';
  END IF;
END$$;

ALTER TABLE "private_company_material_items"
  ADD COLUMN IF NOT EXISTS "handoverConfirmedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "handoverConfirmedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'private_company_material_items_handoverConfirmedById_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_handoverConfirmedById_fkey"
      FOREIGN KEY ("handoverConfirmedById") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "private_company_material_items_handoverConfirmedById_idx"
  ON "private_company_material_items" ("handoverConfirmedById");

CREATE TABLE IF NOT EXISTS "private_company_staff_material_budgets" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "staffRequesterId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "budgetQuantity" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "private_company_staff_material_budgets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "private_company_staff_material_budgets_company_staff_material_key"
  ON "private_company_staff_material_budgets" ("companyId", "staffRequesterId", "materialId");

CREATE INDEX IF NOT EXISTS "private_company_staff_material_budgets_companyId_staffRequesterId_idx"
  ON "private_company_staff_material_budgets" ("companyId", "staffRequesterId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'private_company_staff_material_budgets_companyId_fkey'
  ) THEN
    ALTER TABLE "private_company_staff_material_budgets"
      ADD CONSTRAINT "private_company_staff_material_budgets_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'private_company_staff_material_budgets_staffRequesterId_fkey'
  ) THEN
    ALTER TABLE "private_company_staff_material_budgets"
      ADD CONSTRAINT "private_company_staff_material_budgets_staffRequesterId_fkey"
      FOREIGN KEY ("staffRequesterId") REFERENCES "ticket_requesters"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'private_company_staff_material_budgets_materialId_fkey'
  ) THEN
    ALTER TABLE "private_company_staff_material_budgets"
      ADD CONSTRAINT "private_company_staff_material_budgets_materialId_fkey"
      FOREIGN KEY ("materialId") REFERENCES "private_company_materials"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
