CREATE TABLE IF NOT EXISTS "provisor_platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "ticketCancellationReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ticketResubmitReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisor_platform_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "provisor_platform_settings" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
