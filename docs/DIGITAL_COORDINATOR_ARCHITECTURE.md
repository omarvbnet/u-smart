# U-Smart Digital Project Coordinator Platform – Architecture

## Overview

The platform is an **AI Digital Operational Employee** delivered as a multi-tenant SaaS section within the U-Smart ecosystem. It manages tasks, job duties, enterprise integrations, KPIs, reporting, social outreach, job intelligence, AI CV, subscriptions, notifications, audit, and voice (Iraqi dialect + call handling).

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Next.js 14 App (App Router)                      │
├─────────────────────────────────────────────────────────────────────────┤
│  /coordinator/*     │  Dashboard (RTL, PWA)  │  API Routes  │  Middleware │
├─────────────────────────────────────────────────────────────────────────┤
│  Auth (JWT)  │  RBAC (ADMIN/COORDINATOR/CLIENT)  │  Company isolation    │
├─────────────────────────────────────────────────────────────────────────┤
│  Prisma ORM  │  PostgreSQL (Neon)  │  WebSocket (realtime)  │  Cron (jobs) │
├─────────────────────────────────────────────────────────────────────────┤
│  Stripe  │  OpenAI  │  SMTP  │  Twilio (voice)  │  LinkedIn/Meta/WhatsApp │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Multi-Tenancy

- **Tenant** = `Company`. Every entity (tasks, KPIs, users, etc.) is scoped by `companyId`.
- **Roles per tenant**: `ADMIN` (company owner), `COORDINATOR` (digital employee user), `CLIENT` (end client).
- **Isolation**: All queries filter by `companyId` from the JWT. Middleware validates role and company.

---

## Security

- **JWT**: Access token (short-lived) + refresh flow. Stored httpOnly cookie or header.
- **RBAC**: Middleware checks `role` and `companyId`; route handlers enforce resource ownership.
- **Credentials**: Enterprise system credentials encrypted with AES-256 (server-side only).
- **Audit**: Immutable `AuditLog` for login, task changes, system actions, social, payments.
- **Input**: Validation (Zod) on all API inputs; sanitization for XSS; CSRF protection; rate limiting on auth and public endpoints.

---

## Core Modules (Implementation Order)

| # | Module | Purpose |
|---|--------|--------|
| 1 | Auth & RBAC | Login, JWT, role middleware, company isolation |
| 2 | Task Engine | Lifecycle (Pending→Approved→In Progress→Under Review→Completed→Archived), subtasks, files, checklists |
| 3 | Job Duties | Templates (daily/weekly/monthly/yearly), cron generation, escalation, reminders, daily summary |
| 4 | Enterprise Integration | ExternalSystems, SystemActionsLog, API/Playwright/OAuth2, retry, incident on failure |
| 5 | KPI & Reporting | Target vs actual, status (On Track/Risk/Failed), auto recalc, PDF, monthly auto-report |
| 6 | Social Engine | Connect accounts, send/track messages, follow-up, link to tasks, AI composer |
| 7 | Job Intelligence | Search jobs, extract skills, store results, compare with coordinator profile |
| 8 | AI CV Engine | Analyze JD, rewrite CV, cover letter, export PDF |
| 9 | Subscription & Billing | Stripe checkout, webhooks, plans (Basic/Pro/Enterprise), invoices, billing UI |
| 10 | Notification Engine | In-app, email, push (PWA), trigger-based, escalation |
| 11 | Audit & Compliance | Immutable logs for all critical actions |
| 12 | Iraqi Dialect / Voice | STT, intent, Iraqi/formal/EN, TTS, voice-to-task |
| 13 | Voice Call Engine | Twilio in/out calls, voice confirmation, voice alerts |

---

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind, RTL (Arabic default), PWA.
- **Backend**: Next.js API Routes, Prisma, PostgreSQL (Neon), WebSocket (realtime), Cron (Vercel Cron or worker).
- **Auth**: JWT, RBAC, company-scoped.
- **Payments**: Stripe (checkout, webhooks, subscriptions).
- **Integrations**: OpenAI, SMTP, Twilio (voice), LinkedIn/Meta/WhatsApp (social).

---

## Database (Prisma)

All coordinator entities live in the same PostgreSQL database with clear naming (`coordinator_*` or `cp_*` maps). Key tables: Company, PlatformUser, Task, Subtask, KPI, Report, ExternalSystem, SystemActionLog, SocialAccount, OutreachMessage, SubscriptionPlan, Subscription, Payment, Invoice, Notification, JobDutyTemplate, CoordinatorProfile, AuditLog, VoiceLog, VoiceCallRecord, etc.

---

## Performance

- Response time target &lt; 500ms for read APIs; heavy work (reports, AI) in background jobs.
- Indexes on `companyId`, `status`, `createdAt`, and foreign keys.
- Caching for plan limits and static config where appropriate.

---

## Folder Structure (Coordinator Section)

```
app/
  coordinator/                    # Dashboard (RTL, PWA-ready)
    (auth)/login/
    (dashboard)/
      layout.tsx
      page.tsx
      tasks/
      kpis/
      reports/
      ...
    api/                          # Or under app/api/coordinator/...
lib/
  coordinator/
    auth.ts
    rbac.ts
    encryption.ts
    audit.ts
prisma/
  schema.prisma                   # Includes coordinator_* models
```

API routes can live under `app/api/coordinator/*` for clarity and middleware application.
