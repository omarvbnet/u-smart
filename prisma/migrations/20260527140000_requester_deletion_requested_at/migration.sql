-- AlterTable
ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);
