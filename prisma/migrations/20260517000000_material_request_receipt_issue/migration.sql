-- Receipt dispute when assignee reports materials not received (warehouse workflow).
ALTER TABLE "private_company_material_requests"
ADD COLUMN IF NOT EXISTS "notReceivedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "notReceivedNote" TEXT,
ADD COLUMN IF NOT EXISTS "receiptIssueAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "receiptIssueAcknowledgedById" TEXT;
