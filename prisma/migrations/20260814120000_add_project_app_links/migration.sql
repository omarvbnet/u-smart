-- AlterTable: add app store / play store link list for programming projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "appLinks" JSONB;
