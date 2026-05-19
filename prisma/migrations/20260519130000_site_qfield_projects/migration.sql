-- AlterTable
ALTER TABLE "sites" ADD COLUMN "hasQfield" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sites" ADD COLUMN "qfieldProjects" JSONB;
