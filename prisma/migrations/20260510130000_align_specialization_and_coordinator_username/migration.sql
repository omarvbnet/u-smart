-- Backfill three columns that exist in schema.prisma but were never migrated.
-- Causes P2022 errors on POST /api/auth/requester-push-token,
-- GET /api/provisor-private-company, and various coordinator endpoints.

-- 1) RequesterSpecialization enum (skip if already created by an out-of-band push).
DO $$
BEGIN
  CREATE TYPE "RequesterSpecialization" AS ENUM (
    'ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2) ticket_requesters: specialization + companyCertificationUrl.
ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "specialization" "RequesterSpecialization";

ALTER TABLE "ticket_requesters"
  ADD COLUMN IF NOT EXISTS "companyCertificationUrl" TEXT;

-- 3) registration_requests: specialization (used by admin verification flow).
DO $$
BEGIN
  IF to_regclass('public.registration_requests') IS NOT NULL THEN
    ALTER TABLE "registration_requests"
      ADD COLUMN IF NOT EXISTS "specialization" "RequesterSpecialization";
  END IF;
END $$;

-- 4) coordinator_users.username — required + unique in the schema.
--    The table itself was created out-of-band (no migration), so guard with to_regclass.
DO $$
BEGIN
  IF to_regclass('public.coordinator_users') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE "coordinator_users"
    ADD COLUMN IF NOT EXISTS "username" TEXT;

  -- Backfill any NULLs from email local-part + a slice of the row id so they're unique-ish.
  UPDATE "coordinator_users"
     SET "username" = LOWER(REGEXP_REPLACE(SPLIT_PART("email", '@', 1), '[^a-zA-Z0-9_]', '_', 'g'))
                    || '_' || SUBSTRING("id", 1, 6)
   WHERE "username" IS NULL;

  -- Resolve any duplicates by appending a longer slice of the id.
  UPDATE "coordinator_users" cu
     SET "username" = cu."username" || '_' || SUBSTRING(cu."id", 1, 8)
    FROM (
      SELECT "username"
        FROM "coordinator_users"
       WHERE "username" IS NOT NULL
       GROUP BY "username"
       HAVING COUNT(*) > 1
    ) dup
   WHERE cu."username" = dup."username";

  ALTER TABLE "coordinator_users"
    ALTER COLUMN "username" SET NOT NULL;
END $$;

-- 5) Unique index on coordinator_users.username (idempotent).
DO $$
BEGIN
  IF to_regclass('public.coordinator_users') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "coordinator_users_username_key"
      ON "coordinator_users"("username");
  END IF;
END $$;
