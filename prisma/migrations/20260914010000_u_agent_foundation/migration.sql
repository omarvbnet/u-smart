-- CreateEnum
CREATE TYPE "UAgentExecutionStatus" AS ENUM ('ONLINE', 'THINKING', 'PLANNING', 'WAITING_APPROVAL', 'EXECUTING', 'WAITING_EXTERNAL', 'COMPLETED', 'FAILED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "UAgentMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "UAgentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UAgentRiskLevel" AS ENUM ('READ', 'LOW', 'EXTERNAL', 'HIGH_IMPACT', 'FINANCIAL', 'CRITICAL');

-- CreateTable
CREATE TABLE "u_agent_policies" (
    "id" TEXT NOT NULL,
    "privateCompanyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autonomyLevel" INTEGER NOT NULL DEFAULT 1,
    "allowedTools" JSONB,
    "maxTransactionIqd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailySpendLimitIqd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyAiRequestLimit" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "u_agent_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_agent_conversations" (
    "id" TEXT NOT NULL,
    "privateCompanyId" TEXT,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "status" "UAgentExecutionStatus" NOT NULL DEFAULT 'ONLINE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "u_agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_agent_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT,
    "role" "UAgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "attachments" JSONB,
    "toolName" TEXT,
    "toolCallId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "u_agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_agent_executions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "privateCompanyId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "UAgentExecutionStatus" NOT NULL DEFAULT 'THINKING',
    "timeline" JSONB,
    "plan" JSONB,
    "currentTool" TEXT,
    "resultSummary" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "u_agent_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_agent_approvals" (
    "id" TEXT NOT NULL,
    "privateCompanyId" TEXT,
    "conversationId" TEXT,
    "executionId" TEXT,
    "requestedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "toolId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "riskLevel" "UAgentRiskLevel" NOT NULL DEFAULT 'HIGH_IMPACT',
    "amountIqd" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'IQD',
    "payload" JSONB,
    "expectedResult" TEXT,
    "status" "UAgentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "u_agent_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_agent_usage_records" (
    "id" TEXT NOT NULL,
    "privateCompanyId" TEXT,
    "userId" TEXT,
    "resourceType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "provider" TEXT,
    "model" TEXT,
    "estimatedCost" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "u_agent_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "u_agent_audit_logs" (
    "id" TEXT NOT NULL,
    "privateCompanyId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "toolId" TEXT,
    "permissions" JSONB,
    "approvalId" TEXT,
    "input" JSONB,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "u_agent_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "u_agent_policies_privateCompanyId_key" ON "u_agent_policies"("privateCompanyId");

-- CreateIndex
CREATE INDEX "u_agent_conversations_privateCompanyId_lastMessageAt_idx" ON "u_agent_conversations"("privateCompanyId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "u_agent_conversations_userId_lastMessageAt_idx" ON "u_agent_conversations"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "u_agent_messages_conversationId_createdAt_idx" ON "u_agent_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_executions_privateCompanyId_createdAt_idx" ON "u_agent_executions"("privateCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_executions_userId_createdAt_idx" ON "u_agent_executions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_executions_status_idx" ON "u_agent_executions"("status");

-- CreateIndex
CREATE INDEX "u_agent_approvals_privateCompanyId_status_createdAt_idx" ON "u_agent_approvals"("privateCompanyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_approvals_requestedById_status_idx" ON "u_agent_approvals"("requestedById", "status");

-- CreateIndex
CREATE INDEX "u_agent_usage_records_privateCompanyId_createdAt_idx" ON "u_agent_usage_records"("privateCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_usage_records_userId_createdAt_idx" ON "u_agent_usage_records"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_usage_records_resourceType_createdAt_idx" ON "u_agent_usage_records"("resourceType", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_audit_logs_privateCompanyId_createdAt_idx" ON "u_agent_audit_logs"("privateCompanyId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_audit_logs_actorUserId_createdAt_idx" ON "u_agent_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "u_agent_audit_logs_action_createdAt_idx" ON "u_agent_audit_logs"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "u_agent_policies" ADD CONSTRAINT "u_agent_policies_privateCompanyId_fkey" FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_conversations" ADD CONSTRAINT "u_agent_conversations_privateCompanyId_fkey" FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_conversations" ADD CONSTRAINT "u_agent_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_messages" ADD CONSTRAINT "u_agent_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "u_agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_messages" ADD CONSTRAINT "u_agent_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_executions" ADD CONSTRAINT "u_agent_executions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "u_agent_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_executions" ADD CONSTRAINT "u_agent_executions_privateCompanyId_fkey" FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_executions" ADD CONSTRAINT "u_agent_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_approvals" ADD CONSTRAINT "u_agent_approvals_privateCompanyId_fkey" FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_approvals" ADD CONSTRAINT "u_agent_approvals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "u_agent_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_approvals" ADD CONSTRAINT "u_agent_approvals_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "u_agent_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_approvals" ADD CONSTRAINT "u_agent_approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "ticket_requesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_approvals" ADD CONSTRAINT "u_agent_approvals_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_usage_records" ADD CONSTRAINT "u_agent_usage_records_privateCompanyId_fkey" FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_usage_records" ADD CONSTRAINT "u_agent_usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_audit_logs" ADD CONSTRAINT "u_agent_audit_logs_privateCompanyId_fkey" FOREIGN KEY ("privateCompanyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "u_agent_audit_logs" ADD CONSTRAINT "u_agent_audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "ticket_requesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
