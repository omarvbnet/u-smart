-- CreateEnum
CREATE TYPE "PrivateCompanyTicketPlan" AS ENUM ('PACK_100', 'PACK_1000', 'YEARLY_UNLIMITED');

-- CreateEnum
CREATE TYPE "PrivateCompanyPlanRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PrivateCompanyActivationCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED');

-- AlterTable
ALTER TABLE "private_companies"
    ADD COLUMN "freeTicketsLimit" INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN "ticketsUsed" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "ticketCreditsTotal" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "unlimitedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "private_company_plan_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "planType" "PrivateCompanyTicketPlan" NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "status" "PrivateCompanyPlanRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "private_company_plan_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "private_company_activation_codes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "planType" "PrivateCompanyTicketPlan" NOT NULL,
    "ticketCredits" INTEGER NOT NULL DEFAULT 0,
    "unlimitedUntil" TIMESTAMP(3),
    "status" "PrivateCompanyActivationCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "planRequestId" TEXT,
    "createdByAdminId" TEXT,
    "redeemedByRequesterId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "private_company_activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "private_company_plan_requests_companyId_status_idx" ON "private_company_plan_requests"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "private_company_activation_codes_code_key" ON "private_company_activation_codes"("code");

-- CreateIndex
CREATE INDEX "private_company_activation_codes_companyId_idx" ON "private_company_activation_codes"("companyId");

-- CreateIndex
CREATE INDEX "private_company_activation_codes_companyId_status_idx" ON "private_company_activation_codes"("companyId", "status");

-- AddForeignKey
ALTER TABLE "private_company_plan_requests" ADD CONSTRAINT "private_company_plan_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "private_company_activation_codes" ADD CONSTRAINT "private_company_activation_codes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "private_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
