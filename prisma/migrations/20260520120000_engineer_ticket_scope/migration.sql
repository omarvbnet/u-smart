ALTER TABLE "private_company_departments"
  ADD COLUMN IF NOT EXISTS "engineerTicketScope" TEXT NOT NULL DEFAULT 'BOTH';

ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "privateCompanyEngineerTicketScope" TEXT;
