-- Per-department: maintenance tickets go straight to technician pool vs engineer triage + assign.
ALTER TABLE "private_company_departments"
ADD COLUMN IF NOT EXISTS "maintenanceDispatchMode" TEXT NOT NULL DEFAULT 'DIRECT_TECHNICIAN';
