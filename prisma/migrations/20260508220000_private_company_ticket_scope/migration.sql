-- Extend ProviderAssignmentScope enum with PRIVATE_COMPANY_STAFF
ALTER TYPE "ProviderAssignmentScope" ADD VALUE IF NOT EXISTS 'PRIVATE_COMPANY_STAFF';

-- Add privateCompanyId to visitor_requests so engineer/technician scope can be enforced
ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "privateCompanyId" TEXT;

CREATE INDEX IF NOT EXISTS "visitor_requests_privateCompanyId_idx"
  ON "visitor_requests"("privateCompanyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'visitor_requests_privateCompanyId_fkey'
  ) THEN
    ALTER TABLE "visitor_requests"
      ADD CONSTRAINT "visitor_requests_privateCompanyId_fkey"
      FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
