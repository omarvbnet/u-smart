-- AlterTable
ALTER TABLE "site_shares" ADD COLUMN IF NOT EXISTS "includeTickets" BOOLEAN NOT NULL DEFAULT true;
