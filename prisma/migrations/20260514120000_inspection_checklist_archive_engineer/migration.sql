-- Engineer-created checklist metadata + archive for reuse / hide from default picker
ALTER TABLE "inspection_checklists"
  ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "inspection_checklists"
  ADD COLUMN IF NOT EXISTS "createdByRequesterId" TEXT;

CREATE INDEX IF NOT EXISTS "inspection_checklists_createdByRequesterId_idx"
  ON "inspection_checklists" ("createdByRequesterId");

CREATE INDEX IF NOT EXISTS "inspection_checklists_archived_idx"
  ON "inspection_checklists" ("archived");
