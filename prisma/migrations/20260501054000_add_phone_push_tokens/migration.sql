-- Add push token storage for phone apps (Proviser / QC requester app)

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "phonePushToken" TEXT,
ADD COLUMN IF NOT EXISTS "phonePlatform" TEXT;

ALTER TABLE "ticket_requesters"
ADD COLUMN IF NOT EXISTS "phonePushToken" TEXT,
ADD COLUMN IF NOT EXISTS "phonePlatform" TEXT;

