-- AlterTable: add source, coordinatorFeedback, priority to coordinator_tasks (CoordinatorTask)
ALTER TABLE "coordinator_tasks" ADD COLUMN "source" TEXT;

ALTER TABLE "coordinator_tasks" ADD COLUMN "coordinatorFeedback" TEXT;

ALTER TABLE "coordinator_tasks" ADD COLUMN "priority" TEXT DEFAULT 'normal';

-- CreateIndex
CREATE INDEX "coordinator_tasks_priority_idx" ON "coordinator_tasks"("priority");
