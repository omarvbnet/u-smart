-- Per-department maintenance completion reasons (dropdown when ticket IN_PROGRESS).

CREATE TABLE IF NOT EXISTS "private_company_maintenance_reasons" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_company_maintenance_reasons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "private_company_maintenance_reasons_departmentId_label_key"
    ON "private_company_maintenance_reasons"("departmentId", "label");

CREATE INDEX IF NOT EXISTS "private_company_maintenance_reasons_companyId_departmentId_active_idx"
    ON "private_company_maintenance_reasons"("companyId", "departmentId", "active");

ALTER TABLE "private_company_maintenance_reasons"
    ADD CONSTRAINT "private_company_maintenance_reasons_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "private_company_maintenance_reasons"
    ADD CONSTRAINT "private_company_maintenance_reasons_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "private_company_departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
