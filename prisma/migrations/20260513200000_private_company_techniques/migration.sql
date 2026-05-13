-- Workspace-specific QC / maintenance technique slugs (owner-managed; merged into GET /api/provisor-techniques).

CREATE TABLE IF NOT EXISTS "private_company_techniques" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_company_techniques_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "private_company_techniques_companyId_category_slug_key"
    ON "private_company_techniques"("companyId", "category", "slug");

CREATE INDEX IF NOT EXISTS "private_company_techniques_companyId_active_idx"
    ON "private_company_techniques"("companyId", "active");

CREATE INDEX IF NOT EXISTS "private_company_techniques_departmentId_idx"
    ON "private_company_techniques"("departmentId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'private_company_techniques_companyId_fkey'
    ) THEN
        ALTER TABLE "private_company_techniques"
            ADD CONSTRAINT "private_company_techniques_companyId_fkey"
            FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'private_company_techniques_departmentId_fkey'
    ) THEN
        ALTER TABLE "private_company_techniques"
            ADD CONSTRAINT "private_company_techniques_departmentId_fkey"
            FOREIGN KEY ("departmentId") REFERENCES "private_company_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
