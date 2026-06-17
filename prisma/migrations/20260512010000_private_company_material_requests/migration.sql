-- Material requests (staff) + enums for private company warehouse

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialRequestKind') THEN
    CREATE TYPE "PrivateCompanyMaterialRequestKind" AS ENUM ('INVENTORY_MATERIAL', 'CUSTOM_UNAVAILABLE');
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialRequestStatus') THEN
    CREATE TYPE "PrivateCompanyMaterialRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'FULFILLED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "private_company_material_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "kind" "PrivateCompanyMaterialRequestKind" NOT NULL,
    "materialId" TEXT,
    "customTitle" TEXT,
    "customDescription" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "province" TEXT,
    "notes" TEXT,
    "status" "PrivateCompanyMaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responderId" TEXT,
    "responseNote" TEXT,
    "fulfilledItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_company_material_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "private_company_material_requests_companyId_status_idx" ON "private_company_material_requests"("companyId", "status");
CREATE INDEX "private_company_material_requests_requesterId_idx" ON "private_company_material_requests"("requesterId");
CREATE INDEX "private_company_material_requests_materialId_idx" ON "private_company_material_requests"("materialId");

ALTER TABLE "private_company_material_requests" ADD CONSTRAINT "private_company_material_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "private_company_material_requests" ADD CONSTRAINT "private_company_material_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "private_company_material_requests" ADD CONSTRAINT "private_company_material_requests_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "private_company_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "private_company_material_requests" ADD CONSTRAINT "private_company_material_requests_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
