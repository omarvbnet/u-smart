-- Store submitted credentials in registration requests so approved users
-- can log in to both web dashboard and Proviser app with the same account.
ALTER TABLE "registration_requests"
ADD COLUMN IF NOT EXISTS "username" TEXT,
ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
