-- ─── Extend RequesterRole enum with workspace roles ────────────────────────
ALTER TYPE "RequesterRole" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "RequesterRole" ADD VALUE IF NOT EXISTS 'COORDINATOR';

-- ─── New enum: private-company workspace status ────────────────────────────
DO $$ BEGIN
    CREATE TYPE "PrivateCompanyStatus" AS ENUM ('PENDING','APPROVED','REJECTED','SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ─── private_companies ─────────────────────────────────────────────────────
CREATE TABLE "private_companies" (
    "id"               TEXT NOT NULL,
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "logoUrl"          TEXT,
    "ownerRequesterId" TEXT NOT NULL,
    "status"           "PrivateCompanyStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason"  TEXT,
    "approvedAt"       TIMESTAMP(3),
    "approvedById"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "private_companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "private_companies_ownerRequesterId_key" ON "private_companies"("ownerRequesterId");
CREATE INDEX "private_companies_status_idx" ON "private_companies"("status");

-- ─── private_company_departments ───────────────────────────────────────────
CREATE TABLE "private_company_departments" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT,
    "iconKey"     TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "private_company_departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "private_company_departments_companyId_name_key"
    ON "private_company_departments"("companyId", "name");
CREATE INDEX "private_company_departments_companyId_idx"
    ON "private_company_departments"("companyId");

-- ─── private_company_checklists ────────────────────────────────────────────
CREATE TABLE "private_company_checklists" (
    "id"             TEXT NOT NULL,
    "companyId"      TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "description"    TEXT,
    "category"       "ProviderTaskCategory",
    "techniqueTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "items"          JSONB NOT NULL,
    "createdById"    TEXT NOT NULL,
    "departmentId"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "private_company_checklists_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "private_company_checklists_companyId_idx"
    ON "private_company_checklists"("companyId");
CREATE INDEX "private_company_checklists_departmentId_idx"
    ON "private_company_checklists"("departmentId");

-- ─── ticket_requesters: link to workspace + department ─────────────────────
ALTER TABLE "ticket_requesters"
    ADD COLUMN IF NOT EXISTS "privateCompanyId"           TEXT,
    ADD COLUMN IF NOT EXISTS "privateCompanyDepartmentId" TEXT;
CREATE INDEX IF NOT EXISTS "ticket_requesters_privateCompanyId_idx"
    ON "ticket_requesters"("privateCompanyId");
CREATE INDEX IF NOT EXISTS "ticket_requesters_privateCompanyDepartmentId_idx"
    ON "ticket_requesters"("privateCompanyDepartmentId");

-- ─── Foreign keys ──────────────────────────────────────────────────────────
ALTER TABLE "private_companies"
    ADD CONSTRAINT "private_companies_ownerRequesterId_fkey"
    FOREIGN KEY ("ownerRequesterId") REFERENCES "ticket_requesters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "private_company_departments"
    ADD CONSTRAINT "private_company_departments_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "private_company_checklists"
    ADD CONSTRAINT "private_company_checklists_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "private_company_checklists"
    ADD CONSTRAINT "private_company_checklists_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "ticket_requesters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_requesters"
    ADD CONSTRAINT "ticket_requesters_privateCompanyId_fkey"
    FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_requesters"
    ADD CONSTRAINT "ticket_requesters_privateCompanyDepartmentId_fkey"
    FOREIGN KEY ("privateCompanyDepartmentId") REFERENCES "private_company_departments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
