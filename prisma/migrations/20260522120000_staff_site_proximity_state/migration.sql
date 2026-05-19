CREATE TABLE IF NOT EXISTS "staff_site_proximity_states" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "staffRequesterId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_site_proximity_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_site_proximity_states_siteId_staffRequesterId_key"
    ON "staff_site_proximity_states"("siteId", "staffRequesterId");

CREATE INDEX IF NOT EXISTS "staff_site_proximity_states_companyId_idx"
    ON "staff_site_proximity_states"("companyId");
