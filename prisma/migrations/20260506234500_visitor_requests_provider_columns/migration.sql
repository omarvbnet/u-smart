-- Align visitor_requests with coordinator/provider ticket fields (schema drift fix).
-- Safe on Postgres: enums created once; columns use IF NOT EXISTS.

DO $$ BEGIN
  CREATE TYPE "ProviderTaskCategory" AS ENUM ('MAINTENANCE', 'QUALITY', 'SUPERVISION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProviderRoleScope" AS ENUM ('ANY', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProviderWorkflowState" AS ENUM ('OPEN', 'IN_PROGRESS', 'NEEDS_EDIT', 'RESUBMITTED', 'DONE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProviderAssignmentScope" AS ENUM ('COMPANY_STAFF', 'USMART_STAFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "taskCategory" "ProviderTaskCategory";

-- Nullable in schema (ProviderRoleScope?) with default ANY for new rows
ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "roleScope" "ProviderRoleScope" DEFAULT 'ANY';

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "workflowState" "ProviderWorkflowState" NOT NULL DEFAULT 'OPEN';

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "assignmentScope" "ProviderAssignmentScope";

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "checklistTemplateId" TEXT;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "coordinatorCompanyId" TEXT;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "createdByCoordinatorUserId" TEXT;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "assigneeCoordinatorUserId" TEXT;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "resubmittedByCoordinatorUserId" TEXT;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "resubmitReason" TEXT;

ALTER TABLE "visitor_requests" ADD COLUMN IF NOT EXISTS "resubmittedAt" TIMESTAMP(3);
