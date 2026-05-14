-- Optional workspace ticket scope: restrict visibility/self-assign to one department, or leave null for all departments.

ALTER TABLE "visitor_requests" ADD COLUMN "privateCompanyTargetDepartmentId" TEXT;

CREATE INDEX "visitor_requests_privateCompanyTargetDepartmentId_idx" ON "visitor_requests"("privateCompanyTargetDepartmentId");

ALTER TABLE "visitor_requests" ADD CONSTRAINT "visitor_requests_privateCompanyTargetDepartmentId_fkey" FOREIGN KEY ("privateCompanyTargetDepartmentId") REFERENCES "private_company_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
