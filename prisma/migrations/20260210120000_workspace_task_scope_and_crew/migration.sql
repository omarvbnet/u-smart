-- Per-staff optional allowlist of task technique slugs (empty = inherit department/workspace technique rows).
ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "privateCompanyAllowedTaskSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Optional overrides for proximity-based maintenance teaming (null = use department defaults).
ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "maintenanceProximityJoinOverride" BOOLEAN;
ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "maintenanceProximityRadiusOverrideM" INTEGER;

-- Department-level maintenance proximity teaming (owner-controlled).
ALTER TABLE "private_company_departments" ADD COLUMN IF NOT EXISTS "maintenanceProximityJoinEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "private_company_departments" ADD COLUMN IF NOT EXISTS "maintenanceProximityRadiusM" INTEGER NOT NULL DEFAULT 100;
