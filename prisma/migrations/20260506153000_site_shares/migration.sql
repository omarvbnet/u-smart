-- Site sharing between ticket requesters (read access + related tickets scoped by owner's site identifier)

CREATE TABLE "site_shares" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "sharedWithRequesterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_shares_siteId_sharedWithRequesterId_key"
    ON "site_shares"("siteId", "sharedWithRequesterId");

CREATE INDEX "site_shares_sharedWithRequesterId_idx"
    ON "site_shares"("sharedWithRequesterId");

ALTER TABLE "site_shares"
ADD CONSTRAINT "site_shares_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "sites"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "site_shares"
ADD CONSTRAINT "site_shares_sharedWithRequesterId_fkey"
FOREIGN KEY ("sharedWithRequesterId") REFERENCES "ticket_requesters"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
