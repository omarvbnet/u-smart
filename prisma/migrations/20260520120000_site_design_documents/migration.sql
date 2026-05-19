-- Optional design / specification PDFs attached to sites (owned + workspace).
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "designDocuments" JSONB;
ALTER TABLE "private_company_sites" ADD COLUMN IF NOT EXISTS "designDocuments" JSONB;
