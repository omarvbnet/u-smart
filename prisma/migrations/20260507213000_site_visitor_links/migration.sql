-- CreateTable
CREATE TABLE "site_visitor_links" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdByRequesterId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "includeTickets" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_visitor_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_visitor_links_token_key" ON "site_visitor_links"("token");

-- CreateIndex
CREATE INDEX "site_visitor_links_siteId_idx" ON "site_visitor_links"("siteId");

-- AddForeignKey
ALTER TABLE "site_visitor_links" ADD CONSTRAINT "site_visitor_links_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
