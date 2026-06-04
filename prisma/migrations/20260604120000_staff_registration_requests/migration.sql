-- Staff (engineer / technician) self-registration requests submitted from the
-- public Provisor staff registration page. Approved by admin → creates a
-- verified ticket_requester that can sign in to the Provisor app.
CREATE TABLE IF NOT EXISTS "staff_registration_requests" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "RequesterRole" NOT NULL,
    "specialization" "RequesterSpecialization",
    "province" TEXT NOT NULL,
    "idDocumentUrl" TEXT NOT NULL,
    "certificateUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_registration_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_registration_requests_status_idx" ON "staff_registration_requests"("status");
