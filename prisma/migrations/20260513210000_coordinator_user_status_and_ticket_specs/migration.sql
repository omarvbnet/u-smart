-- coordinator_users.status (Prisma expects it; some DBs predate the column)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CoordinatorUserStatus') THEN
    CREATE TYPE "CoordinatorUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');
  END IF;
END $$;

ALTER TABLE "coordinator_users"
  ADD COLUMN IF NOT EXISTS "status" "CoordinatorUserStatus" NOT NULL DEFAULT 'ACTIVE';

-- Optional routing: engineers see pool tickets when tags empty OR their specialization matches.
ALTER TABLE "visitor_requests"
  ADD COLUMN IF NOT EXISTS "specializationTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
