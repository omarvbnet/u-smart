-- AlterTable
ALTER TABLE "u_agent_policies" ADD COLUMN IF NOT EXISTS "whatsappIngressEnabled" BOOLEAN NOT NULL DEFAULT false;
