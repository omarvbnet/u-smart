# U-Smart Digital Project Coordinator – Implementation Roadmap

## Phase 1 – Foundation (Current)

- [x] Architecture document
- [x] Prisma schema (all coordinator tables)
- [x] Folder structure: `app/coordinator/*`, `lib/coordinator/*`
- [x] Auth & RBAC: JWT, login, company isolation (requireCoordinatorRole, audit log on login)
- [x] Task Management Engine: CRUD, lifecycle (PENDING→…→ARCHIVED), subtasks, checklist/fileUrls in schema; APIs: GET/POST /api/coordinator/tasks, GET/PATCH/DELETE /api/coordinator/tasks/[id]
- [x] Dashboard layout: RTL-ready (dir=rtl, lang=ar), nav, role-based menu, login page, tasks list and task detail

**Setup:** Run `npx prisma migrate dev` to create coordinator_* tables (if your DB allows; otherwise apply migration manually). Then `npx prisma db seed` to create demo company and user (admin@coordinator.usmart.com / Admin@Coordinator123). Set `COORDINATOR_JWT_SECRET` and `COORDINATOR_PASSWORD_SALT` in .env for production.

## Phase 2 – Automation & Integrations

- [x] Job Duties Engine: templates CRUD, cron expression, GET /api/coordinator/cron/generate-tasks (CRON_SECRET), task generation from templates
- [x] Enterprise Integration Layer: ExternalSystems CRUD, SystemActionsLog on run, POST .../action with retry (3x), placeholder for API/Playwright/OAuth2
- [x] KPI & Reporting: KPI CRUD, target vs actual, status auto (On Track / At Risk / Failed), reports list/create; PDF export (POST .../reports/[id]/generate-pdf) and monthly auto-report (GET .../cron/monthly-report, vercel.json 0 9 1 * *) — Phase 2b done

## Phase 3 – Communication & Intelligence

- [x] Social Communication Engine: connect accounts (LinkedIn/Meta/WhatsApp), outreach messages CRUD, link to tasks, dashboard; AI composer (POST .../ai/compose-message, "تحسين النص بالذكاء الاصطناعي" on social page) — Phase 3b done
- [x] Job Intelligence Engine: job results CRUD (keyword, source, extracted skills), coordinator profile (skills, cvUrl), dashboard
- [x] AI CV Engine: generated applications CRUD (cvUrl, coverLetterUrl, jobResultId), dashboard; OpenAI analyze/rewrite (POST .../ai/rewrite, "تحسين النص بالذكاء الاصطناعي" on applications page for CV/cover) — Phase 3b done

## Phase 4 – Billing & Notifications

- [x] Subscription & Billing: Stripe checkout, webhooks, Basic/Professional/Enterprise, invoices, billing dashboard
- [x] Notification Engine: in-app, email, push (PWA), trigger-based, escalation

## Phase 5 – Audit & Voice

- [x] Audit & Compliance: immutable AuditLog for login, task, job_duty, kpi, report, system, social, outreach, job_result, profile, generated_application; GET audit-logs API (ADMIN); audit dashboard page with filters
- [x] Iraqi Dialect / Language: server-side STT via Whisper (POST /api/coordinator/voice/transcribe, OPENAI_API_KEY); intent/TTS documented in COORDINATOR_VOICE_SETUP.md for future enhancement
- [x] Voice Call Engine: voice-call-records + voice-logs APIs; Twilio incoming webhook (POST /api/coordinator/voice/webhook/incoming) with TwiML; dashboard Voice page (logs + calls)
- [x] In-app Voice Assistant: floating mic button, panel with browser Speech Recognition (ar-SA), save transcript to voice-logs, "Create task from this" (prefill on tasks page)

## Deliverables per phase

- Production-ready code (no mocks)
- API routes + types + validation
- Dashboard UI for the section
- Tests and security review for critical paths
