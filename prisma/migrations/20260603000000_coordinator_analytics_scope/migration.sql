-- Owner-controlled analytics visibility for COORDINATOR workspace staff.
-- NULL / 'DEPARTMENT' = own department only (default); 'COMPANY' = whole workspace.
ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "privateCompanyCoordinatorAnalyticsScope" TEXT;
