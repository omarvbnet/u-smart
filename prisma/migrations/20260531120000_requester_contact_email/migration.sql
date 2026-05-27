-- Proviser Flutter app v1.0.5 — optional public/business contact email
-- for COMPANY and private-company-workspace members. Distinct from the
-- unique auth/identity `email` column.
ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
