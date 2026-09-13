-- CreateEnum
CREATE TYPE "UAgentAiProviderKind" AS ENUM ('OPENAI', 'DEEPSEEK', 'CLAUDE', 'CUSTOM');

-- CreateTable
CREATE TABLE "u_agent_ai_providers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "UAgentAiProviderKind" NOT NULL,
    "baseUrl" TEXT,
    "apiKeyEncrypted" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "modelFast" TEXT,
    "modelReason" TEXT,
    "modelVision" TEXT,
    "modelEmbed" TEXT,
    "modelTranscribe" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "u_agent_ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "u_agent_ai_providers_slug_key" ON "u_agent_ai_providers"("slug");

-- CreateIndex
CREATE INDEX "u_agent_ai_providers_enabled_priority_idx" ON "u_agent_ai_providers"("enabled", "priority");

-- CreateIndex
CREATE INDEX "u_agent_ai_providers_isDefault_idx" ON "u_agent_ai_providers"("isDefault");
