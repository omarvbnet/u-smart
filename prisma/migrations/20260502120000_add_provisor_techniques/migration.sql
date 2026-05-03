-- Provisor: admin-defined inspection & maintenance technique labels (used by app + web QC dashboard)

CREATE TABLE "provisor_techniques" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisor_techniques_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provisor_techniques_category_slug_key" ON "provisor_techniques"("category", "slug");
