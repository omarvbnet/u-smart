CREATE TABLE IF NOT EXISTS "staff_live_locations" (
    "requesterId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_live_locations_pkey" PRIMARY KEY ("requesterId")
);

CREATE INDEX IF NOT EXISTS "staff_live_locations_companyId_updatedAt_idx"
    ON "staff_live_locations"("companyId", "updatedAt");

ALTER TABLE "staff_live_locations"
    ADD CONSTRAINT "staff_live_locations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_live_locations"
    ADD CONSTRAINT "staff_live_locations_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "ticket_requesters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
