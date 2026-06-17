-- CreateEnum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TicketApiKeyAccessRequestStatus') THEN
    CREATE TYPE "TicketApiKeyAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ticket_api_key_access_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "useCase" TEXT,
    "label" TEXT,
    "status" "TicketApiKeyAccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_api_key_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ticket_api_keys" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "accessRequestId" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_api_key_access_requests_requesterId_status_idx" ON "ticket_api_key_access_requests"("requesterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_api_keys_accessRequestId_key" ON "ticket_api_keys"("accessRequestId");

-- CreateIndex
CREATE INDEX "ticket_api_keys_requesterId_idx" ON "ticket_api_keys"("requesterId");

-- CreateIndex
CREATE INDEX "ticket_api_keys_keyPrefix_idx" ON "ticket_api_keys"("keyPrefix");

-- AddForeignKey
ALTER TABLE "ticket_api_key_access_requests" ADD CONSTRAINT "ticket_api_key_access_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_api_keys" ADD CONSTRAINT "ticket_api_keys_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_api_keys" ADD CONSTRAINT "ticket_api_keys_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "ticket_api_key_access_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
