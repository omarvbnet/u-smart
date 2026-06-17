-- Per-department owner control: whether engineers / technicians may self-assign from the availability pool (workspace tickets).

ALTER TABLE "private_company_departments" ADD COLUMN IF NOT EXISTS "engineerAvailabilityPoolEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "private_company_departments" ADD COLUMN IF NOT EXISTS "technicianAvailabilityPoolEnabled" BOOLEAN NOT NULL DEFAULT true;
