-- Align `ticket_requesters` with Prisma: verification workflow columns were in schema
-- but never migrated, causing P2022 on create (e.g. POST /api/auth/requester-otp/register).

DO $$
BEGIN
  CREATE TYPE "RequesterVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "verificationStatus" "RequesterVerificationStatus" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "verificationRejectedReason" TEXT;

ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
