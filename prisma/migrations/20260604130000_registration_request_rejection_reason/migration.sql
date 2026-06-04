-- The `rejectionReason` column exists on the RegistrationRequest model but was
-- never added to the database via a migration (schema drift). Selecting it
-- (Prisma selects all columns by default) raised P2022 across registration /
-- upgrade / staff-registration flows. Add it idempotently to align prod.
ALTER TABLE "registration_requests"
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
