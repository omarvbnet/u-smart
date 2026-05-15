-- Per workspace ticket technique: optional ticket expense toggle and reason presets.
ALTER TABLE "private_company_techniques" ADD COLUMN IF NOT EXISTS "ticketExpensesEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "private_company_techniques" ADD COLUMN IF NOT EXISTS "ticketExpenseReasons" TEXT[] NOT NULL DEFAULT '{}';
