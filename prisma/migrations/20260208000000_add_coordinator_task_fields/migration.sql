-- AlterTable: add source, coordinatorFeedback, priority to coordinator_tasks (CoordinatorTask)
DO $$ BEGIN
  IF to_regclass('public.coordinator_tasks') IS NOT NULL THEN
    ALTER TABLE "coordinator_tasks" ADD COLUMN IF NOT EXISTS "source" TEXT;
    ALTER TABLE "coordinator_tasks" ADD COLUMN IF NOT EXISTS "coordinatorFeedback" TEXT;
    ALTER TABLE "coordinator_tasks" ADD COLUMN IF NOT EXISTS "priority" TEXT DEFAULT 'normal';
    CREATE INDEX IF NOT EXISTS "coordinator_tasks_priority_idx" ON "coordinator_tasks"("priority");
  END IF;
END $$;
