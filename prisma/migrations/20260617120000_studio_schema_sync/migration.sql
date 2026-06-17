-- Sync indexes/columns after provisor platform baseline

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."CoordinatorRole" ADD VALUE 'ENGINEER';
ALTER TYPE "public"."CoordinatorRole" ADD VALUE 'QUALITY_ENGINEER';
ALTER TYPE "public"."CoordinatorRole" ADD VALUE 'SUPERVISION_ENGINEER';
ALTER TYPE "public"."CoordinatorRole" ADD VALUE 'TECHNICIAN';

-- DropIndex
DROP INDEX "public"."inspection_checklists_companyId_idx";

-- DropIndex
DROP INDEX "public"."ticket_requesters_privateCompanyDepartmentId_idx";

-- DropIndex
DROP INDEX "public"."ticket_requesters_privateCompanyId_idx";

-- DropIndex
DROP INDEX "public"."visitor_requests_privateCompanyId_idx";

-- AlterTable
ALTER TABLE "public"."coordinator_users" ADD COLUMN IF NOT EXISTS     "managedByUserId" TEXT,
ADD COLUMN     "phonePlatform" TEXT,
ADD COLUMN     "phonePushToken" TEXT;

-- AlterTable
ALTER TABLE "public"."private_company_departments" ALTER COLUMN "maintenanceProximityRadiusM" SET DEFAULT 500;

-- AlterTable
ALTER TABLE "public"."provisor_platform_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coordinator_ticket_charges_ticketId_key" ON "public"."coordinator_ticket_charges"("ticketId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coordinator_ticket_charges_companyId_billedAt_idx" ON "public"."coordinator_ticket_charges"("companyId", "billedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_buildings_projectId_idx" ON "public"."studio_buildings"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_cables_circuitId_idx" ON "public"."studio_cables"("circuitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_circuits_panelId_idx" ON "public"."studio_circuits"("panelId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "studio_companies_slug_key" ON "public"."studio_companies"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_connections_sourceId_idx" ON "public"."studio_connections"("sourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_connections_targetId_idx" ON "public"."studio_connections"("targetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_design_revisions_projectId_createdAt_idx" ON "public"."studio_design_revisions"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_devices_floorId_idx" ON "public"."studio_devices"("floorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_devices_roomId_idx" ON "public"."studio_devices"("roomId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_floors_buildingId_idx" ON "public"."studio_floors"("buildingId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "studio_hvac_units_deviceId_key" ON "public"."studio_hvac_units"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "studio_members_companyId_userId_key" ON "public"."studio_members"("companyId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_panels_projectId_idx" ON "public"."studio_panels"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "studio_projects_shareToken_key" ON "public"."studio_projects"("shareToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_projects_companyId_idx" ON "public"."studio_projects"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_projects_ownerUserId_idx" ON "public"."studio_projects"("ownerUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_reports_projectId_idx" ON "public"."studio_reports"("projectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_rooms_floorId_idx" ON "public"."studio_rooms"("floorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_simulation_sessions_projectId_idx" ON "public"."studio_simulation_sessions"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "studio_smart_devices_deviceId_key" ON "public"."studio_smart_devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "studio_standard_references_code_key" ON "public"."studio_standard_references"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "studio_validation_errors_projectId_severity_idx" ON "public"."studio_validation_errors"("projectId", "severity");

-- AddForeignKey
ALTER TABLE "public"."visitor_requests" ADD CONSTRAINT "visitor_requests_coordinatorCompanyId_fkey" FOREIGN KEY ("coordinatorCompanyId") REFERENCES "public"."coordinator_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visitor_requests" ADD CONSTRAINT "visitor_requests_createdByCoordinatorUserId_fkey" FOREIGN KEY ("createdByCoordinatorUserId") REFERENCES "public"."coordinator_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visitor_requests" ADD CONSTRAINT "visitor_requests_assigneeCoordinatorUserId_fkey" FOREIGN KEY ("assigneeCoordinatorUserId") REFERENCES "public"."coordinator_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visitor_requests" ADD CONSTRAINT "visitor_requests_resubmittedByCoordinatorUserId_fkey" FOREIGN KEY ("resubmittedByCoordinatorUserId") REFERENCES "public"."coordinator_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coordinator_ticket_charges" ADD CONSTRAINT "coordinator_ticket_charges_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."coordinator_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coordinator_ticket_charges" ADD CONSTRAINT "coordinator_ticket_charges_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."visitor_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coordinator_users" ADD CONSTRAINT "coordinator_users_managedByUserId_fkey" FOREIGN KEY ("managedByUserId") REFERENCES "public"."coordinator_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_members" ADD CONSTRAINT "studio_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."studio_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_members" ADD CONSTRAINT "studio_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_projects" ADD CONSTRAINT "studio_projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."studio_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_projects" ADD CONSTRAINT "studio_projects_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_buildings" ADD CONSTRAINT "studio_buildings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_floors" ADD CONSTRAINT "studio_floors_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "public"."studio_buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_rooms" ADD CONSTRAINT "studio_rooms_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "public"."studio_floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_devices" ADD CONSTRAINT "studio_devices_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "public"."studio_floors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_devices" ADD CONSTRAINT "studio_devices_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."studio_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_devices" ADD CONSTRAINT "studio_devices_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "public"."studio_panels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_panels" ADD CONSTRAINT "studio_panels_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_circuits" ADD CONSTRAINT "studio_circuits_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "public"."studio_panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_cables" ADD CONSTRAINT "studio_cables_circuitId_fkey" FOREIGN KEY ("circuitId") REFERENCES "public"."studio_circuits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_hvac_units" ADD CONSTRAINT "studio_hvac_units_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."studio_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_smart_devices" ADD CONSTRAINT "studio_smart_devices_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."studio_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_connections" ADD CONSTRAINT "studio_connections_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."studio_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_connections" ADD CONSTRAINT "studio_connections_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "public"."studio_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_simulation_sessions" ADD CONSTRAINT "studio_simulation_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_validation_errors" ADD CONSTRAINT "studio_validation_errors_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_reports" ADD CONSTRAINT "studio_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."studio_design_revisions" ADD CONSTRAINT "studio_design_revisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."studio_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."private_company_maintenance_reasons_companyId_departmentId_acti" RENAME TO "private_company_maintenance_reasons_companyId_departmentId__idx";

-- RenameIndex
ALTER INDEX "public"."private_company_staff_material_budgets_companyId_staffRequester" RENAME TO "private_company_staff_material_budgets_companyId_staffReque_idx";

-- RenameIndex
ALTER INDEX "public"."private_company_staff_material_budgets_company_staff_material_k" RENAME TO "private_company_staff_material_budgets_companyId_staffReque_key";

-- RenameIndex
ALTER INDEX "public"."private_company_ticket_expenses_companyId_staffRequesterId_crea" RENAME TO "private_company_ticket_expenses_companyId_staffRequesterId__idx";

