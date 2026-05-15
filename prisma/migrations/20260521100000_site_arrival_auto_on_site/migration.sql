-- Site arrival: auto ON_SITE when assigned staff is within proximity radius.
ALTER TABLE "private_companies"
ADD COLUMN IF NOT EXISTS "siteArrivalAutoOnSiteEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "private_company_departments"
ADD COLUMN IF NOT EXISTS "siteArrivalAutoOnSiteEnabled" BOOLEAN;
