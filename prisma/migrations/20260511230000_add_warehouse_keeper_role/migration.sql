-- Add WAREHOUSE_KEEPER to RequesterRole enum (PostgreSQL).
DO $$
BEGIN
  ALTER TYPE "RequesterRole" ADD VALUE 'WAREHOUSE_KEEPER';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
