-- Baseline tables/enums missing from incremental migrations.
-- FK constraints omitted here (added by later migrations / db push history).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyRequestStatus') THEN
    CREATE TYPE "public"."CompanyRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RegistrationRequestStatus') THEN
    CREATE TYPE "public"."RegistrationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyStatus') THEN
    CREATE TYPE "public"."CompanyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TicketApiKeyAccessRequestStatus') THEN
    CREATE TYPE "public"."TicketApiKeyAccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequesterStatus') THEN
    CREATE TYPE "public"."RequesterStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequesterRole') THEN
    CREATE TYPE "public"."RequesterRole" AS ENUM ('COMPANY', 'ENGINEER', 'TECHNICIAN', 'PERSONAL', 'WORKER', 'MANAGER', 'COORDINATOR', 'WAREHOUSE_KEEPER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequesterSpecialization') THEN
    CREATE TYPE "public"."RequesterSpecialization" AS ENUM ('ELECTRICAL', 'MECHANICAL', 'CIVIL', 'TELECOM', 'PROGRAMMER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequesterVerificationStatus') THEN
    CREATE TYPE "public"."RequesterVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TicketStatus') THEN
    CREATE TYPE "public"."TicketStatus" AS ENUM ('PENDING', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeGrade') THEN
    CREATE TYPE "public"."EmployeeGrade" AS ENUM ('TECHNICIAN_C', 'TECHNICIAN_B', 'TECHNICIAN_A', 'ENGINEER', 'SUPERVISOR', 'TEAM_LEADER', 'SECTION_HEAD', 'MANAGER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmployeeSpecialized') THEN
    CREATE TYPE "public"."EmployeeSpecialized" AS ENUM ('ELECTRICAL_TECHNICIAN', 'TELECOM_TECHNICIAN', 'FIBER_TECHNICIAN', 'ENGINEER');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformReasonKind') THEN
    CREATE TYPE "public"."PlatformReasonKind" AS ENUM ('MAINTENANCE', 'EXPENSE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlatformReasonAudience') THEN
    CREATE TYPE "public"."PlatformReasonAudience" AS ENUM ('INDIVIDUAL', 'COMPANY', 'BOTH');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IssueReportStatus') THEN
    CREATE TYPE "public"."IssueReportStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrainingRequestStatus') THEN
    CREATE TYPE "public"."TrainingRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductType') THEN
    CREATE TYPE "public"."ProductType" AS ENUM ('KNX', 'Buspro', 'Zigbee');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductRequestStatus') THEN
    CREATE TYPE "public"."ProductRequestStatus" AS ENUM ('PENDING', 'CONTACTED', 'QUOTED', 'CLOSED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CoordinatorRole') THEN
    CREATE TYPE "public"."CoordinatorRole" AS ENUM ('ADMIN', 'COMPANY_OWNER', 'COORDINATOR', 'ENGINEER', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN', 'CLIENT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CoordinatorUserStatus') THEN
    CREATE TYPE "public"."CoordinatorUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BLOCKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderTaskCategory') THEN
    CREATE TYPE "public"."ProviderTaskCategory" AS ENUM ('MAINTENANCE', 'QUALITY', 'SUPERVISION');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderRoleScope') THEN
    CREATE TYPE "public"."ProviderRoleScope" AS ENUM ('ANY', 'QUALITY_ENGINEER', 'SUPERVISION_ENGINEER', 'TECHNICIAN');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderWorkflowState') THEN
    CREATE TYPE "public"."ProviderWorkflowState" AS ENUM ('OPEN', 'IN_PROGRESS', 'NEEDS_EDIT', 'RESUBMITTED', 'DONE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProviderAssignmentScope') THEN
    CREATE TYPE "public"."ProviderAssignmentScope" AS ENUM ('COMPANY_STAFF', 'USMART_STAFF', 'PRIVATE_COMPANY_STAFF');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TicketBillingPlan') THEN
    CREATE TYPE "public"."TicketBillingPlan" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CoordinatorTaskStatus') THEN
    CREATE TYPE "public"."CoordinatorTaskStatus" AS ENUM ('PENDING', 'APPROVED', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'ARCHIVED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExternalSystemType') THEN
    CREATE TYPE "public"."ExternalSystemType" AS ENUM ('API', 'PLAYWRIGHT', 'OAUTH2');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KPIStatus') THEN
    CREATE TYPE "public"."KPIStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'FAILED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionPlanTier') THEN
    CREATE TYPE "public"."SubscriptionPlanTier" AS ENUM ('BASIC', 'PROFESSIONAL', 'ENTERPRISE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SubscriptionStatus') THEN
    CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VoiceCallDirection') THEN
    CREATE TYPE "public"."VoiceCallDirection" AS ENUM ('INCOMING', 'OUTGOING');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyStatus') THEN
    CREATE TYPE "public"."PrivateCompanyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyTicketPlan') THEN
    CREATE TYPE "public"."PrivateCompanyTicketPlan" AS ENUM ('PACK_100', 'PACK_1000', 'YEARLY_UNLIMITED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyPlanRequestStatus') THEN
    CREATE TYPE "public"."PrivateCompanyPlanRequestStatus" AS ENUM ('PENDING', 'FULFILLED', 'REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyActivationCodeStatus') THEN
    CREATE TYPE "public"."PrivateCompanyActivationCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanySiteConfirmationStatus') THEN
    CREATE TYPE "public"."PrivateCompanySiteConfirmationStatus" AS ENUM ('CONFIRMED', 'PENDING');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialTracking') THEN
    CREATE TYPE "public"."PrivateCompanyMaterialTracking" AS ENUM ('SERIAL', 'BULK');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialItemStatus') THEN
    CREATE TYPE "public"."PrivateCompanyMaterialItemStatus" AS ENUM ('IN_WAREHOUSE', 'ASSIGNED', 'USED', 'DAMAGED', 'LOST', 'RETIRED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialMovementType') THEN
    CREATE TYPE "public"."PrivateCompanyMaterialMovementType" AS ENUM ('STOCKED', 'ASSIGNED', 'RETURNED', 'USED', 'TRANSFERRED', 'DAMAGED', 'LOST', 'ADJUSTED', 'HANDOVER_CONFIRMED', 'HANDOVER_REJECTED', 'RETURN_REQUESTED', 'RETURN_REJECTED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialRequestKind') THEN
    CREATE TYPE "public"."PrivateCompanyMaterialRequestKind" AS ENUM ('INVENTORY_MATERIAL', 'CUSTOM_UNAVAILABLE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivateCompanyMaterialRequestStatus') THEN
    CREATE TYPE "public"."PrivateCompanyMaterialRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'AWAITING_RECEIPT', 'FULFILLED', 'CANCELLED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudioRole') THEN
    CREATE TYPE "public"."StudioRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'SENIOR_ENGINEER', 'ELECTRICAL_ENGINEER', 'HVAC_ENGINEER', 'SMART_HOME_ENGINEER', 'TECHNICIAN', 'VIEWER', 'CLIENT');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudioBuildingType') THEN
    CREATE TYPE "public"."StudioBuildingType" AS ENUM ('HOUSE', 'VILLA', 'APARTMENT', 'RESIDENTIAL', 'COMMERCIAL', 'HOTEL', 'HOSPITAL', 'INDUSTRIAL');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudioProjectStatus') THEN
    CREATE TYPE "public"."StudioProjectStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StudioValidationSeverity') THEN
    CREATE TYPE "public"."StudioValidationSeverity" AS ENUM ('CRITICAL', 'WARNING', 'RECOMMENDATION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."statistics" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "suffix" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statistics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."visitor_requests" (
    "id" TEXT NOT NULL,
    "buildingType" TEXT,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "technique" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT,
    "email" TEXT,
    "serviceSlug" TEXT NOT NULL DEFAULT 'smart-home-automation',
    "siteName" TEXT,
    "siteCoordinator" TEXT,
    "slaHours" INTEGER,
    "currentAmps" DOUBLE PRECISION,
    "kwh" DOUBLE PRECISION,
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "taskCategory" "public"."ProviderTaskCategory",
    "roleScope" "public"."ProviderRoleScope" DEFAULT 'ANY',
    "workflowState" "public"."ProviderWorkflowState" NOT NULL DEFAULT 'OPEN',
    "assignmentScope" "public"."ProviderAssignmentScope",
    "checklistTemplateId" TEXT,
    "privateCompanyId" TEXT,
    "privateCompanyTargetDepartmentId" TEXT,
    "coordinatorCompanyId" TEXT,
    "createdByCoordinatorUserId" TEXT,
    "assigneeCoordinatorUserId" TEXT,
    "resubmittedByCoordinatorUserId" TEXT,
    "resubmitReason" TEXT,
    "resubmittedAt" TIMESTAMP(3),
    "assignedTeamId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "maintenanceDescription" TEXT,
    "beforeImageUrls" JSONB,
    "finishingImageUrls" JSONB,
    "checklistResponse" JSONB,
    "requesterId" TEXT,
    "specializationTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ticket_status_logs" (
    "id" TEXT NOT NULL,
    "visitorRequestId" TEXT NOT NULL,
    "status" "public"."TicketStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_status_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ticket_comments" (
    "id" TEXT NOT NULL,
    "visitorRequestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ticket_evidence" (
    "id" TEXT NOT NULL,
    "visitorRequestId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."ticket_requesters" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "company" TEXT,
    "companyCertificationUrl" TEXT,
    "specialization" "public"."RequesterSpecialization",
    "verificationStatus" "public"."RequesterVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationRejectedReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "serviceSlug" TEXT NOT NULL DEFAULT 'enterprise-networking',
    "role" "public"."RequesterRole" NOT NULL DEFAULT 'COMPANY',
    "province" TEXT,
    "provinceFilterActive" BOOLEAN NOT NULL DEFAULT true,
    "status" "public"."RequesterStatus" NOT NULL DEFAULT 'ACTIVE',
    "hasUpdatedCredentials" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "phonePushToken" TEXT,
    "phonePlatform" TEXT,
    "preferredLocale" TEXT,
    "photoUrl" TEXT,
    "contactEmail" TEXT,
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "privateCompanyId" TEXT,
    "privateCompanyDepartmentId" TEXT,
    "privateCompanyAllowedTaskSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "privateCompanyEngineerTicketScope" TEXT,
    "privateCompanyCoordinatorAnalyticsScope" TEXT,
    "maintenanceProximityJoinOverride" BOOLEAN,
    "maintenanceProximityRadiusOverrideM" INTEGER,

    CONSTRAINT "ticket_requesters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."company_requests" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "pocName" TEXT NOT NULL,
    "pocEmail" TEXT,
    "pocPhone" TEXT NOT NULL,
    "certificateUrl" TEXT,
    "serviceSlug" TEXT NOT NULL DEFAULT 'enterprise-networking',
    "status" "public"."CompanyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."email_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."registration_requests" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "evidenceUrl" TEXT NOT NULL,
    "specialization" "public"."RequesterSpecialization",
    "rejectionReason" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "role" "public"."RequesterRole" NOT NULL,
    "status" "public"."RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "pocName" TEXT NOT NULL,
    "pocPhone" TEXT NOT NULL,
    "certificateUrl" TEXT,
    "serviceSlug" TEXT NOT NULL DEFAULT 'enterprise-networking',
    "status" "public"."CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "requesterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."sites" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "hasQfield" BOOLEAN NOT NULL DEFAULT false,
    "qfieldProjects" JSONB,
    "designDocuments" JSONB,
    "requesterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."phone_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_otps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "ticketId" TEXT,
    "requesterId" TEXT,
    "forAdmin" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT NOT NULL,
    "grade" "public"."EmployeeGrade" NOT NULL,
    "education" TEXT,
    "specialized" "public"."EmployeeSpecialized" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."inspection_checklists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "companyId" TEXT,
    "taskCategory" "public"."ProviderTaskCategory",
    "techniqueTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdByRequesterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_checklists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_ticket_charges" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "plan" "public"."TicketBillingPlan" NOT NULL,
    "rateUsd" DOUBLE PRECISION NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "billedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_ticket_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."training_requests" (
    "id" TEXT NOT NULL,
    "serviceSlug" TEXT NOT NULL,
    "serviceTitle" TEXT NOT NULL,
    "serviceDesc" TEXT,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterPhone" TEXT NOT NULL,
    "company" TEXT,
    "message" TEXT,
    "budget" TEXT,
    "status" "public"."TrainingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "specifications" JSONB,
    "userManualUrl" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productType" "public"."ProductType" NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "translations" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."product_requests" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productType" "public"."ProductType" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."ProductRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "subscriptionPlanId" TEXT,
    "freeTicketsUsed" INTEGER NOT NULL DEFAULT 0,
    "freeTicketsLimit" INTEGER NOT NULL DEFAULT 50,
    "activeTicketPlan" "public"."TicketBillingPlan",
    "ticketPlanActivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."CoordinatorRole" NOT NULL DEFAULT 'COORDINATOR',
    "status" "public"."CoordinatorUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "phonePushToken" TEXT,
    "phonePlatform" TEXT,
    "preferredLocale" TEXT,
    "companyId" TEXT NOT NULL,
    "managedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."CoordinatorTaskStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "checklist" JSONB,
    "fileUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "coordinatorFeedback" TEXT,
    "inboundReplyTo" TEXT,
    "awaitingFeedbackFrom" TEXT,
    "aiProcessedAt" TIMESTAMP(3),
    "priority" TEXT DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_subtasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_subtasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_comments" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_kpis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "actualValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "status" "public"."KPIStatus" NOT NULL DEFAULT 'ON_TRACK',
    "companyId" TEXT NOT NULL,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_kpis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "companyId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_external_systems" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."ExternalSystemType" NOT NULL,
    "configEnc" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_external_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_system_action_logs" (
    "id" TEXT NOT NULL,
    "systemId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_system_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_social_accounts" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenEnc" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_social_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_outreach_messages" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "replyAt" TIMESTAMP(3),
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_outreach_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_conversations" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_subscription_plans" (
    "id" TEXT NOT NULL,
    "tier" "public"."SubscriptionPlanTier" NOT NULL,
    "name" TEXT NOT NULL,
    "stripePriceId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "interval" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_subscriptions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "stripeSubId" TEXT,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_invoices" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "amountCents" INTEGER NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "channel" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_job_duty_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taskTemplate" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_job_duty_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_job_results" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "source" TEXT,
    "rawResult" JSONB,
    "extractedSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_job_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cvUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_generated_applications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "jobResultId" TEXT,
    "cvUrl" TEXT,
    "coverLetterUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_generated_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_audit_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_voice_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transcript" TEXT,
    "detectedLanguage" TEXT,
    "intent" TEXT,
    "actionTaken" TEXT,
    "audioFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_voice_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."coordinator_voice_call_records" (
    "id" TEXT NOT NULL,
    "direction" "public"."VoiceCallDirection" NOT NULL,
    "duration" INTEGER,
    "transcript" TEXT,
    "taskLinked" TEXT,
    "status" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_voice_call_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."StudioRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_projects" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "consultant" TEXT,
    "location" TEXT,
    "reference" TEXT,
    "revision" TEXT NOT NULL DEFAULT 'R0',
    "buildingType" "public"."StudioBuildingType" NOT NULL DEFAULT 'VILLA',
    "status" "public"."StudioProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "smartBuilding" BOOLEAN NOT NULL DEFAULT false,
    "smartProtocol" TEXT,
    "hvacMode" TEXT NOT NULL DEFAULT 'auto',
    "hvacTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "energySources" TEXT[] DEFAULT ARRAY['grid']::TEXT[],
    "standards" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "designJson" JSONB,
    "shareToken" TEXT,
    "sharePublic" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_buildings" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_floors" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "mapUrl" TEXT,
    "mapWidth" INTEGER,
    "mapHeight" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_floors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_rooms" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "zone" TEXT NOT NULL DEFAULT 'general',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "areaM2" DOUBLE PRECISION,
    "luxTarget" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_devices" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "roomId" TEXT,
    "catalogId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "panelId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_panels" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratedA" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_panels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_circuits" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratedA" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_circuits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_cables" (
    "id" TEXT NOT NULL,
    "circuitId" TEXT,
    "catalogId" TEXT NOT NULL,
    "lengthM" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_cables_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_hvac_units" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "coolingKw" DOUBLE PRECISION,
    "heatingKw" DOUBLE PRECISION,
    "cop" DOUBLE PRECISION,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_hvac_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_smart_devices" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "busAddress" TEXT,
    "groupAddress" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_smart_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_connections" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourcePortId" TEXT,
    "targetPortId" TEXT,
    "cableId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_simulation_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "stateJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "studio_simulation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_validation_errors" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deviceId" TEXT,
    "severity" "public"."StudioValidationSeverity" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "standard" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_validation_errors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_reports" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT,
    "meta" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_design_revisions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "designJson" JSONB NOT NULL,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_design_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."studio_standard_references" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_standard_references_pkey" PRIMARY KEY ("id")
);
















































































