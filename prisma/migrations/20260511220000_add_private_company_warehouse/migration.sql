-- Idempotent migration adding the Private Company Warehouse feature.
-- Creates three new enums + tables for: material catalog, serial-numbered
-- items (one row per physical unit), and a movement/audit log of every
-- stock event (stock-in, assign, return, use-on-ticket, transfer, etc.).

-- ─── Enums ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialTracking'
  ) THEN
    CREATE TYPE "PrivateCompanyMaterialTracking" AS ENUM ('SERIAL', 'BULK');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialItemStatus'
  ) THEN
    CREATE TYPE "PrivateCompanyMaterialItemStatus" AS ENUM (
      'IN_WAREHOUSE',
      'ASSIGNED',
      'USED',
      'DAMAGED',
      'LOST',
      'RETIRED'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialMovementType'
  ) THEN
    CREATE TYPE "PrivateCompanyMaterialMovementType" AS ENUM (
      'STOCKED',
      'ASSIGNED',
      'RETURNED',
      'USED',
      'TRANSFERRED',
      'DAMAGED',
      'LOST',
      'ADJUSTED'
    );
  END IF;
END$$;

-- ─── private_company_materials ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "private_company_materials" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "unit" TEXT,
  "iconKey" TEXT,
  "color" TEXT,
  "tracking" "PrivateCompanyMaterialTracking" NOT NULL DEFAULT 'SERIAL',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "private_company_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "private_company_materials_companyId_name_key"
  ON "private_company_materials" ("companyId", "name");

CREATE INDEX IF NOT EXISTS "private_company_materials_companyId_idx"
  ON "private_company_materials" ("companyId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_materials_companyId_fkey'
  ) THEN
    ALTER TABLE "private_company_materials"
      ADD CONSTRAINT "private_company_materials_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_materials_createdById_fkey'
  ) THEN
    ALTER TABLE "private_company_materials"
      ADD CONSTRAINT "private_company_materials_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- ─── private_company_material_items ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "private_company_material_items" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "materialId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "province" TEXT NOT NULL,
  "status" "PrivateCompanyMaterialItemStatus" NOT NULL DEFAULT 'IN_WAREHOUSE',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT,
  "assignedToId" TEXT,
  "usedTicketId" TEXT,
  "usedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "private_company_material_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "private_company_material_items_companyId_serialNumber_key"
  ON "private_company_material_items" ("companyId", "serialNumber");

CREATE INDEX IF NOT EXISTS "private_company_material_items_companyId_status_idx"
  ON "private_company_material_items" ("companyId", "status");

CREATE INDEX IF NOT EXISTS "private_company_material_items_companyId_province_idx"
  ON "private_company_material_items" ("companyId", "province");

CREATE INDEX IF NOT EXISTS "private_company_material_items_materialId_idx"
  ON "private_company_material_items" ("materialId");

CREATE INDEX IF NOT EXISTS "private_company_material_items_assignedToId_idx"
  ON "private_company_material_items" ("assignedToId");

CREATE INDEX IF NOT EXISTS "private_company_material_items_usedTicketId_idx"
  ON "private_company_material_items" ("usedTicketId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_items_companyId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_items_materialId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_materialId_fkey"
      FOREIGN KEY ("materialId") REFERENCES "private_company_materials"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_items_assignedToId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_items_usedTicketId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_usedTicketId_fkey"
      FOREIGN KEY ("usedTicketId") REFERENCES "visitor_requests"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_items_createdById_fkey'
  ) THEN
    ALTER TABLE "private_company_material_items"
      ADD CONSTRAINT "private_company_material_items_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

-- ─── private_company_material_movements ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "private_company_material_movements" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "type" "PrivateCompanyMaterialMovementType" NOT NULL,
  "fromStaffId" TEXT,
  "toStaffId" TEXT,
  "ticketId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "private_company_material_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "private_company_material_movements_companyId_createdAt_idx"
  ON "private_company_material_movements" ("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS "private_company_material_movements_itemId_idx"
  ON "private_company_material_movements" ("itemId");

CREATE INDEX IF NOT EXISTS "private_company_material_movements_ticketId_idx"
  ON "private_company_material_movements" ("ticketId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_movements_companyId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_movements"
      ADD CONSTRAINT "private_company_material_movements_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "private_companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_movements_itemId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_movements"
      ADD CONSTRAINT "private_company_material_movements_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "private_company_material_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_movements_fromStaffId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_movements"
      ADD CONSTRAINT "private_company_material_movements_fromStaffId_fkey"
      FOREIGN KEY ("fromStaffId") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_movements_toStaffId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_movements"
      ADD CONSTRAINT "private_company_material_movements_toStaffId_fkey"
      FOREIGN KEY ("toStaffId") REFERENCES "ticket_requesters"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_movements_ticketId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_movements"
      ADD CONSTRAINT "private_company_material_movements_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "visitor_requests"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'private_company_material_movements_actorId_fkey'
  ) THEN
    ALTER TABLE "private_company_material_movements"
      ADD CONSTRAINT "private_company_material_movements_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "ticket_requesters"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
