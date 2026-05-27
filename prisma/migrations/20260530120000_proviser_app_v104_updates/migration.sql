-- Proviser Flutter app v1.0.4 server foundations
-- 1. Department crew permissions
ALTER TABLE "private_company_departments"
  ADD COLUMN IF NOT EXISTS "crewCanLogExpenses"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "crewCanCloseTickets" BOOLEAN NOT NULL DEFAULT false;

-- 2. Profile photo on requester
ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "photoUrl" TEXT;

-- 3. Platform-managed reasons (maintenance / expense) for INDIVIDUAL & COMPANY tickets
DO $$ BEGIN
  CREATE TYPE "PlatformReasonKind" AS ENUM ('MAINTENANCE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PlatformReasonAudience" AS ENUM ('INDIVIDUAL', 'COMPANY', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "platform_reasons" (
  "id"          TEXT NOT NULL,
  "kind"        "PlatformReasonKind" NOT NULL,
  "audience"    "PlatformReasonAudience" NOT NULL DEFAULT 'BOTH',
  "label"       TEXT NOT NULL,
  "description" TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "usageCount"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_reasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_reasons_kind_audience_label_key"
  ON "platform_reasons"("kind", "audience", "label");
CREATE INDEX IF NOT EXISTS "platform_reasons_kind_active_idx"
  ON "platform_reasons"("kind", "active");
CREATE INDEX IF NOT EXISTS "platform_reasons_audience_idx"
  ON "platform_reasons"("audience");

-- 4. Issue reports (in-app bug / feedback reporting)
DO $$ BEGIN
  CREATE TYPE "IssueReportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "issue_report_types" (
  "id"          TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "description" TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "issue_report_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "issue_report_types_slug_key"
  ON "issue_report_types"("slug");

CREATE TABLE IF NOT EXISTS "issue_reports" (
  "id"              TEXT NOT NULL,
  "requesterId"     TEXT NOT NULL,
  "typeId"          TEXT,
  "typeLabel"       TEXT,
  "title"           TEXT NOT NULL,
  "description"     TEXT NOT NULL,
  "attachmentUrls"  TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status"          "IssueReportStatus" NOT NULL DEFAULT 'PENDING',
  "adminNote"       TEXT,
  "handledById"     TEXT,
  "handledAt"       TIMESTAMP(3),
  "appVersion"      TEXT,
  "platform"        TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "issue_reports_requesterId_createdAt_idx"
  ON "issue_reports"("requesterId", "createdAt");
CREATE INDEX IF NOT EXISTS "issue_reports_status_createdAt_idx"
  ON "issue_reports"("status", "createdAt");

ALTER TABLE "issue_reports"
  ADD CONSTRAINT "issue_reports_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "issue_reports_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "issue_report_types"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "issue_reports_handledById_fkey"
    FOREIGN KEY ("handledById") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed a few default issue report types so the dropdown is never empty.
INSERT INTO "issue_report_types" ("id", "slug", "label", "description", "sortOrder", "active", "updatedAt")
VALUES
  ('iss_type_bug',         'bug',         'Bug / crash',              'App stopped working or crashed.',          10, true, NOW()),
  ('iss_type_feature',     'feature',     'Feature request',          'Suggest a new feature or improvement.',    20, true, NOW()),
  ('iss_type_account',     'account',     'Account / login problem',  'Cannot log in / wrong info on profile.',   30, true, NOW()),
  ('iss_type_data',        'data',        'Wrong / missing data',     'A ticket, site, or material looks wrong.', 40, true, NOW()),
  ('iss_type_other',       'other',       'Other',                    'Something else.',                          90, true, NOW())
ON CONFLICT ("slug") DO NOTHING;
