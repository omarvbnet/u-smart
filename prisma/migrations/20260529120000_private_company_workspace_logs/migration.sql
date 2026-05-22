-- CreateTable
CREATE TABLE "private_company_workspace_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "actorRequesterId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "summary" TEXT NOT NULL,
    "departmentId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_company_workspace_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "private_company_workspace_logs_companyId_createdAt_idx" ON "private_company_workspace_logs"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "private_company_workspace_logs_companyId_action_idx" ON "private_company_workspace_logs"("companyId", "action");

-- CreateIndex
CREATE INDEX "private_company_workspace_logs_departmentId_idx" ON "private_company_workspace_logs"("departmentId");

-- AddForeignKey
ALTER TABLE "private_company_workspace_logs" ADD CONSTRAINT "private_company_workspace_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_company_workspace_logs" ADD CONSTRAINT "private_company_workspace_logs_actorRequesterId_fkey" FOREIGN KEY ("actorRequesterId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_company_workspace_logs" ADD CONSTRAINT "private_company_workspace_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "private_company_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
