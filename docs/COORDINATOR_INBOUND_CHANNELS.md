# Coordinator: Receiving Tasks by Call, Email, and WhatsApp

This document describes how the coordinator can **receive tasks** from multiple channels (voice call, email, WhatsApp) and how **daily performance** and **escalation** work.

---

## 1. Task sources

Tasks can have a **source**:

- **voice** – created from an incoming phone call (Twilio)
- **email** – created from inbound email webhook
- **whatsapp** – created from inbound WhatsApp webhook
- **manual** – created from the dashboard or API without a channel

The coordinator can add **feedback** (e.g. “اتصلت بأحمد، قال…”) on any task. For “call Ahmed and give feedback,” the coordinator (or you) uses the task detail page to record the call outcome in the feedback field.

---

## 2. Voice (incoming call)

- **Setup:** [COORDINATOR_VOICE_SETUP.md](./COORDINATOR_VOICE_SETUP.md)
- When a call hits the Twilio webhook **incoming** route, the app:
  - Creates a **CoordinatorVoiceCallRecord**
  - Creates a **CoordinatorTask** with `source: 'voice'`, title “مكالمة واردة”, and links the task to the call record
- The coordinator sees the task in the dashboard, can open it, add **coordinator feedback** (تغذية راجعة منسق), and escalate if needed.

---

## 3. Email (inbound webhook)

Tasks from email are created by posting to the **inbound email** API. Your email provider (SendGrid Inbound Parse, Mailgun, etc.) must POST to this URL when an email is received.

- **Endpoint:** `POST /api/coordinator/inbound/email`
- **Auth:** If `COORDINATOR_INBOUND_SECRET` is set, send it as:
  - Header: `X-Inbound-Secret: <secret>` or `Authorization: Bearer <secret>`
- **Body (JSON):** `{ "from": "sender@example.com", "subject": "Task title", "text": "Email body" }`  
  Some providers use `body` instead of `text`; the route accepts both.
- **Behaviour:** Creates a task with `source: 'email'`, title from `subject` (or “مهمة من البريد”), description from body and sender. Task is created for the first company and assigned to the first admin (or configure per-company later).

**Env:**

- `COORDINATOR_INBOUND_SECRET` (optional) – shared secret for the webhook. If set, requests without this secret get 401.

**Example (SendGrid Inbound Parse):**  
Configure the Parse URL to your app, e.g. `https://your-domain.com/api/coordinator/inbound/email`, and in your Parse webhook handler forward the parsed fields as `from`, `subject`, `text` (or `body`) in the JSON body, and add the secret in the header.

---

## 4. WhatsApp (inbound + coordinator number)

The coordinator can have a **dedicated WhatsApp number** (Twilio Sandbox or WhatsApp Business API). Messages to that number create tasks; admins can send replies from the dashboard.

- **Inbound endpoint:** `POST /api/coordinator/inbound/whatsapp`
  - **Twilio:** Configure in Twilio Console → WhatsApp → “When a message comes in” → this URL (POST). Twilio sends `application/x-www-form-urlencoded`; the app validates `X-Twilio-Signature` when `TWILIO_AUTH_TOKEN` is set.
  - **Other providers:** Send JSON with `From`/`Body` (or `from`/`body`); if `COORDINATOR_INBOUND_SECRET` is set, send it in `X-Inbound-Secret` or `Authorization: Bearer <secret>`.
- **Behaviour:** Creates a task with `source: 'whatsapp'`, title from first line of message (or “رسالة واتساب”), description from body and sender.

**Env:** See [COORDINATOR_WHATSAPP_SETUP.md](./COORDINATOR_WHATSAPP_SETUP.md) for full setup.

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` – for sending and displaying the coordinator number; webhook validation uses `TWILIO_AUTH_TOKEN`.
- `TWILIO_COORDINATOR_COMPANY_ID` (optional) – company to assign inbound tasks to; if not set, first company.
- `COORDINATOR_INBOUND_SECRET` (optional) – only for non-Twilio JSON webhooks.

---

## 5. Daily performance and KPIs

- **Cron:** `GET /api/coordinator/cron/daily-performance` runs on schedule (e.g. 8:00 UTC in `vercel.json`). It creates a **daily** report per company and sends an in-app notification to all company **admins** with a short summary: task counts (pending, in progress, completed) and KPI counts (at risk, failed), plus a nudge to review and escalate if needed.
- **Manual trigger (admins):** From the **Reports** page, the button **“ملخص الأداء اليومي الآن”** calls `POST /api/coordinator/cron/daily-performance` (session auth, admin only). Same logic for the current company: creates daily report, builds summary, notifies admins.

So when you say “check all team performance on daily basis,” the coordinator (system) sends the team performance and KPIs to admins daily (cron) or on demand (button), with escalation guidance when there are at-risk or failed KPIs.

---

## 6. Escalation

- **Task escalation:** On the task detail page, the **“تصعيد عاجل”** button (for non-urgent tasks) calls `POST /api/coordinator/tasks/[id]/escalate`. The task’s priority becomes **urgent**, all company admins get an in-app notification (with optional reason), and the action is logged in audit (`task_escalate`).
- **Urgent things:** For urgent items, use this escalation path; the coordinator can also add feedback (e.g. “اتصلت بأحمد وأبلغته بالوضع”) before or after escalating.

---

## 7. AI coordinator agent (reads and uses all data)

The **AI coordinator** (OpenAI) can **read all company data** and give feedback accordingly. It acts like a coordinator: manages task status, sends replies, and gives recommendations based on the full picture.

### Data the AI can read (per company)

- **Tasks:** Counts by status, source, priority; recent tasks (title, status, whether they have feedback or WhatsApp reply-to).
- **KPIs:** List with actual vs target and status (ON_TRACK, AT_RISK, FAILED).
- **Reports:** Recent report titles and types.
- **Audit:** Recent actions (task_create, task_update, task_ai_process, etc.).
- **Voice:** Call records (last 7 days), voice logs count.
- **Job duty templates** count, **social accounts** (platforms).

### Endpoints

- **GET /api/coordinator/ai/context** — Returns the full company context (for the current user’s company). Used by the agent.
- **POST /api/coordinator/ai/agent** — Body: `{ "query": "optional question" }`. The AI reads the full context and returns **summary**, **recommendations**, and **answer** (in Arabic). Does not modify data. Use this from the dashboard “المنسق الذكي” section.
- **POST /api/coordinator/tasks/[id]/ai-process** — For one task: the AI gets the **full company context** plus the task and its feedback. It returns suggested status, reply message, and optional **feedback** (e.g. “لديك 3 مهام عاجلة أخرى”). The app updates the task status and sends the reply to WhatsApp if applicable.
- **POST /api/coordinator/ai/create-task** — Body: `{ "request": "وصف طلب العميل" }`. The AI suggests title, description, and priority; the app creates a task for the current company. Use from the dashboard card **"إنشاء مهمة من طلب العميل"**.
- **POST /api/coordinator/ai/execute** — Body: `{ "command": "أمر بالعربية" }`. The AI returns **actions** (create_task, update_task, escalate). The app resolves task IDs (full id or last 6 chars) and executes them. Use from the dashboard **"تحكم كامل بالذكاء الاصطناعي"** (e.g. create task from customer request, update task by ref to completed, escalate).

### Automation (no human required)

- When the coordinator saves feedback (PATCH) on a task with WhatsApp inboundReplyTo, the AI runs automatically: updates status, generates reply, sends to sender. No button click.
- Cron GET /api/coordinator/cron/ai-agent runs every 15 min; uses CRON_SECRET.

### Dashboard

- **لوحة التحكم:** The “المنسق الذكي” card lets you ask a question (or leave blank) and click “اسأل المنسق الذكي”. You get a summary and recommendations based on all tasks, KPIs, reports, and recent activity.
- **Create task from request:** Use the "إنشاء مهمة من طلب العميل" card: enter customer request, click to create; AI suggests title/description/priority.
- **Full control (execute):** Use "تحكم كامل بالذكاء الاصطناعي": enter a command in Arabic; AI runs create/update/escalate actions.
- **Task detail:** When you click “معالجة بالذكاء الاصطناعي”, the AI uses the full context and can add a note (e.g. priority or other tasks to watch).

---

## 8. Checklist

- [ ] AI coordinator: Set OPENAI_API_KEY; on task detail add feedback and click "معالجة بالذكاء الاصطناعي" to update status and send AI-generated reply to WhatsApp sender.
- [ ] Voice: Twilio webhook for incoming calls pointing to the coordinator voice incoming route (see COORDINATOR_VOICE_SETUP.md).
- [ ] Email: Configure your provider to POST to `/api/coordinator/inbound/email` with `from`, `subject`, `text` (or `body`); set `COORDINATOR_INBOUND_SECRET` if you want to secure the webhook.
- [ ] WhatsApp: Configure Twilio (or provider) to POST to `/api/coordinator/inbound/whatsapp` with `From`/`Body` (or `from`/`body`); set `COORDINATOR_INBOUND_SECRET` and optionally `TWILIO_COORDINATOR_COMPANY_ID`.
- [ ] Daily performance: Ensure `vercel.json` includes the daily-performance cron path; set `CRON_SECRET` or `COORDINATOR_CRON_SECRET` in Vercel. Use “ملخص الأداء اليومي الآن” on the Reports page to run it manually.
- [ ] Escalation: Use “تصعيد عاجل” on task detail and add coordinator feedback for “call Ahmed and give feedback” flows.
