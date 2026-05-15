-- Assignee handover reject + keeper return request / staff approval workflow.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PrivateCompanyMaterialMovementType'
      AND e.enumlabel = 'HANDOVER_REJECTED'
  ) THEN
    ALTER TYPE "PrivateCompanyMaterialMovementType" ADD VALUE 'HANDOVER_REJECTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PrivateCompanyMaterialMovementType'
      AND e.enumlabel = 'RETURN_REQUESTED'
  ) THEN
    ALTER TYPE "PrivateCompanyMaterialMovementType" ADD VALUE 'RETURN_REQUESTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'PrivateCompanyMaterialMovementType'
      AND e.enumlabel = 'RETURN_REJECTED'
  ) THEN
    ALTER TYPE "PrivateCompanyMaterialMovementType" ADD VALUE 'RETURN_REJECTED';
  END IF;
END$$;

ALTER TABLE "private_company_material_items"
  ADD COLUMN IF NOT EXISTS "handoverRejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "handoverRejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "returnRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "returnRequestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "returnRequestNote" TEXT,
  ADD COLUMN IF NOT EXISTS "returnRejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "returnRejectionReason" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'private_company_material_items_returnRequestedById_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_returnRequestedById_fkey"
      FOREIGN KEY ("returnRequestedById") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "private_company_material_items_returnRequestedById_idx"
  ON "private_company_material_items" ("returnRequestedById");
