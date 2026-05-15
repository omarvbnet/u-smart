ALTER TABLE "private_companies"
ADD COLUMN IF NOT EXISTS "ticketCancellationReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
