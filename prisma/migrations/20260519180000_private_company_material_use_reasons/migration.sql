-- Workspace-defined dropdown reasons for material use / damage / loss audit notes.

ALTER TABLE "private_companies" ADD COLUMN IF NOT EXISTS "materialUseReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
