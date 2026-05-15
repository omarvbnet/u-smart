-- Workspace ticket expenses: settings on company + line items per ticket/staff.

ALTER TABLE "private_companies"
ADD COLUMN IF NOT EXISTS "ticketExpensesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "ticketExpenseReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN IF NOT EXISTS "ticketExpensesActivationPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "ticketExpensesActivationRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "ticketExpensesActivationRequestedById" TEXT,
ADD COLUMN IF NOT EXISTS "ticketExpensesEnabledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "ticketExpensesEnabledById" TEXT;

ALTER TABLE "private_companies"
ADD CONSTRAINT "private_companies_ticketExpensesActivationRequestedById_fkey"
FOREIGN KEY ("ticketExpensesActivationRequestedById") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "private_companies"
ADD CONSTRAINT "private_companies_ticketExpensesEnabledById_fkey"
FOREIGN KEY ("ticketExpensesEnabledById") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "private_company_ticket_expenses" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "staffRequesterId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IQD',
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "ticketProvince" TEXT,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_company_ticket_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "private_company_ticket_expenses_companyId_createdAt_idx" ON "private_company_ticket_expenses"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "private_company_ticket_expenses_companyId_staffRequesterId_createdAt_idx" ON "private_company_ticket_expenses"("companyId", "staffRequesterId", "createdAt");
CREATE INDEX IF NOT EXISTS "private_company_ticket_expenses_companyId_ticketId_idx" ON "private_company_ticket_expenses"("companyId", "ticketId");
CREATE INDEX IF NOT EXISTS "private_company_ticket_expenses_companyId_ticketProvince_idx" ON "private_company_ticket_expenses"("companyId", "ticketProvince");
CREATE INDEX IF NOT EXISTS "private_company_ticket_expenses_companyId_departmentId_idx" ON "private_company_ticket_expenses"("companyId", "departmentId");

ALTER TABLE "private_company_ticket_expenses" ADD CONSTRAINT "private_company_ticket_expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "private_company_ticket_expenses" ADD CONSTRAINT "private_company_ticket_expenses_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "visitor_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "private_company_ticket_expenses" ADD CONSTRAINT "private_company_ticket_expenses_staffRequesterId_fkey" FOREIGN KEY ("staffRequesterId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
