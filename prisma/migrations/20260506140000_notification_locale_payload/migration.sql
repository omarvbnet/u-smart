-- AlterTable
ALTER TABLE "ticket_requesters" ADD COLUMN "preferredLocale" TEXT;

-- AlterTable
ALTER TABLE "coordinator_users" ADD COLUMN "preferredLocale" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "payload" JSONB;
