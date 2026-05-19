-- Workspace sites (shared across all staff; optional QField packages)
DO $$ BEGIN
    CREATE TYPE "PrivateCompanySiteConfirmationStatus" AS ENUM ('CONFIRMED', 'PENDING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "private_company_sites" (
    "id"                     TEXT NOT NULL,
    "companyId"              TEXT NOT NULL,
    "siteCode"               TEXT NOT NULL,
    "location"               TEXT NOT NULL,
    "province"               TEXT NOT NULL,
    "latitude"               DOUBLE PRECISION,
    "longitude"              DOUBLE PRECISION,
    "hasQfield"              BOOLEAN NOT NULL DEFAULT false,
    "qfieldProjects"         JSONB,
    "confirmationStatus"     "PrivateCompanySiteConfirmationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "pendingChange"          JSONB,
    "createdByRequesterId"   TEXT NOT NULL,
    "confirmedByRequesterId" TEXT,
    "confirmedAt"            TIMESTAMP(3),
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_company_sites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "private_company_sites_companyId_siteCode_key" ON "private_company_sites"("companyId", "siteCode");
CREATE INDEX "private_company_sites_companyId_idx" ON "private_company_sites"("companyId");
CREATE INDEX "private_company_sites_companyId_confirmationStatus_idx" ON "private_company_sites"("companyId", "confirmationStatus");

ALTER TABLE "private_company_sites" ADD CONSTRAINT "private_company_sites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "private_company_sites" ADD CONSTRAINT "private_company_sites_createdByRequesterId_fkey" FOREIGN KEY ("createdByRequesterId") REFERENCES "ticket_requesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "private_company_sites" ADD CONSTRAINT "private_company_sites_confirmedByRequesterId_fkey" FOREIGN KEY ("confirmedByRequesterId") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
