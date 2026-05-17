-- Link registration_requests to an existing ticket_requester (role upgrade PERSONAL → COMPANY).
ALTER TABLE "registration_requests"
ADD COLUMN IF NOT EXISTS "requesterId" TEXT;

CREATE INDEX IF NOT EXISTS "registration_requests_requesterId_idx"
ON "registration_requests"("requesterId");
