-- Per-user WhatsApp permissions for U Agent (messages / files / calls).
CREATE TABLE IF NOT EXISTS "u_agent_whatsapp_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT false,
    "canSendMessages" BOOLEAN NOT NULL DEFAULT false,
    "canSendFiles" BOOLEAN NOT NULL DEFAULT false,
    "canStartCalls" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "u_agent_whatsapp_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "u_agent_whatsapp_consents_userId_key"
  ON "u_agent_whatsapp_consents"("userId");

DO $$ BEGIN
  ALTER TABLE "u_agent_whatsapp_consents"
    ADD CONSTRAINT "u_agent_whatsapp_consents_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "ticket_requesters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
