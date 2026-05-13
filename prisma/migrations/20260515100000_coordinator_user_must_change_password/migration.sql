-- coordinator_users.mustChangePassword (Prisma CoordinatorUser; legacy DBs may lack it)
ALTER TABLE "coordinator_users"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
