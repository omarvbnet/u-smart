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
- [x] KPI & Reporting: KPI CRUD, target vs actual, status auto (On Track / At Risk / Failed), reports list/create; PDF export and monthly auto-report in Phase 2b

## Phase 3 – Communication & Intelligence

- [ ] Social Communication Engine: connect accounts, send/track, follow-up, link to tasks, AI composer
- [ ] Job Intelligence Engine: search jobs, extract skills, store results, compare with profile
- [ ] AI CV Engine: analyze JD, rewrite CV, cover letter, PDF export (OpenAI)

## Phase 4 – Billing & Notifications

- [ ] Subscription & Billing: Stripe checkout, webhooks, Basic/Professional/Enterprise, invoices, billing dashboard
- [ ] Notification Engine: in-app, email, push (PWA), trigger-based, escalation

## Phase 5 – Audit & Voice

- [ ] Audit & Compliance: immutable AuditLog for login, task, system, social, payment
- [ ] Iraqi Dialect / Language: STT, intent, Iraqi/formal/EN, TTS, voice-to-task
- [ ] Voice Call Engine: Twilio in/out, voice confirmation, voice alerts
- [ ] In-app Voice Assistant: floating button, real-time transcription, task execution

## Deliverables per phase

- Production-ready code (no mocks)
- API routes + types + validation
- Dashboard UI for the section
- Tests and security review for critical paths
