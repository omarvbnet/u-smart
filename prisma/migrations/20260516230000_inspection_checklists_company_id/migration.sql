-- Align inspection_checklists with Prisma (company scope + task metadata).
-- Fixes P2022: column inspection_checklists.companyId does not exist.

ALTER TABLE "inspection_checklists" ADD COLUMN IF NOT EXISTS "companyId" TEXT;

ALTER TABLE "inspection_checklists" ADD COLUMN IF NOT EXISTS "taskCategory" "ProviderTaskCategory";

ALTER TABLE "inspection_checklists"
  ADD COLUMN IF NOT EXISTS "techniqueTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS "inspection_checklists_companyId_idx"
  ON "inspection_checklists" ("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inspection_checklists_companyId_fkey'
  ) THEN
    ALTER TABLE "inspection_checklists"
      ADD CONSTRAINT "inspection_checklists_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "coordinator_companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
