-- AlterTable
ALTER TABLE "ticket_requesters" ADD COLUMN IF NOT EXISTS "preferredLocale" TEXT;

-- AlterTable
ALTER TABLE "coordinator_users" ADD COLUMN IF NOT EXISTS "preferredLocale" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "payload" JSONB;
