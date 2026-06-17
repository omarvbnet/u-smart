-- Per-staff optional allowlist of task technique slugs (empty = inherit department/workspace technique rows).
DO $$ BEGIN
  IF to_regclass('public.ticket_requesters') IS NOT NULL THEN
    ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "privateCompanyAllowedTaskSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
    ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "maintenanceProximityJoinOverride" BOOLEAN;
    ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "maintenanceProximityRadiusOverrideM" INTEGER;
  END IF;
END $$;

-- Department-level maintenance proximity teaming (owner-controlled).
DO $$ BEGIN
  IF to_regclass('public.private_company_departments') IS NOT NULL THEN
    ALTER TABLE "private_company_departments" ADD COLUMN IF NOT EXISTS "maintenanceProximityJoinEnabled" BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE "private_company_departments" ADD COLUMN IF NOT EXISTS "maintenanceProximityRadiusM" INTEGER NOT NULL DEFAULT 100;
  END IF;
END $$;
