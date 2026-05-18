-- AlterTable
ALTER TABLE "ticket_api_keys" ADD COLUMN "allowedDepartmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
