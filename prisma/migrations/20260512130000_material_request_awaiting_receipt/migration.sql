-- After keeper dispatches materials, request must confirm receipt before FULFILLED.

ALTER TYPE "PrivateCompanyMaterialRequestStatus" ADD VALUE IF NOT EXISTS 'AWAITING_RECEIPT';

ALTER TABLE "private_company_material_requests"
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "receivedNote" TEXT;
