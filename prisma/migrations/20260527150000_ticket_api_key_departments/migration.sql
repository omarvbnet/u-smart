-- AlterTable
ALTER TABLE "ticket_api_keys" ADD COLUMN IF NOT EXISTS "allowedDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
