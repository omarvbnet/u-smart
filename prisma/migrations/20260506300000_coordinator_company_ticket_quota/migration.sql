-- Ticket quota / billing columns on coordinator_companies (used when approving company requests & creating tickets).

DO $$ BEGIN
  CREATE TYPE "TicketBillingPlan" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "coordinator_companies" ADD COLUMN IF NOT EXISTS "freeTicketsUsed" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "coordinator_companies" ADD COLUMN IF NOT EXISTS "freeTicketsLimit" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "coordinator_companies" ADD COLUMN IF NOT EXISTS "activeTicketPlan" "TicketBillingPlan";

ALTER TABLE "coordinator_companies" ADD COLUMN IF NOT EXISTS "ticketPlanActivatedAt" TIMESTAMP(3);
