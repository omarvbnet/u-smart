-- AlterTable (runs after init creates `careers`)
ALTER TABLE "careers" ADD COLUMN IF NOT EXISTS "translations" JSONB;
