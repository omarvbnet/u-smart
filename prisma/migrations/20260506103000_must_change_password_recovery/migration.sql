-- AlterTable
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ticket_requesters" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
