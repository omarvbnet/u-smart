-- Prisma schema includes CoordinatorRole::COMPANY_OWNER; some databases were
-- created before this label existed, causing 22P02 on coordinator_users.role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CoordinatorRole')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'CoordinatorRole'
         AND e.enumlabel = 'COMPANY_OWNER'
     ) THEN
    ALTER TYPE "CoordinatorRole" ADD VALUE 'COMPANY_OWNER';
  END IF;
END
$$;
