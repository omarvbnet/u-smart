# U Agent — API URLs, parameters, and AI providers

U Agent is the AI operating layer inside **Proviser**. It is not a separate app.

## Base URL

Use your production (or local) site origin:

- Production example: `https://www.usmart-iot.com`
- Local: `http://localhost:3000`

All agent routes are under `/api/agent/*`. Proviser web UI: `/proviser/u-agent`.  
Admin AI providers: `/admin/ai-providers`.

Flutter uses `ApiConfig.baseUrl` + the same paths (Bearer token).

---

## Authentication

| Client | Auth |
|--------|------|
| Flutter / mobile | `Authorization: Bearer <requester_jwt>` |
| Proviser web | Cookie `requester_token` (same JWT) |
| Admin APIs | Admin cookie session (`requireAdmin`) |

Never send `organizationId` / `privateCompanyId` from the client as authority — the server resolves workspace from the signed-in user.

---

## Agent API reference

### `GET /api/agent/status`

Returns agent status, greeting, AI provider health, policy snapshot.

**Response (success):** `status`, `greeting`, `aiConfigured`, `activeProvider`, `providers[]`, `policy`, `workspaceId`, `role`

---

### `POST /api/agent/message`

Run one agent turn (plan → tools → reply).

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `text` | string | yes | User message (Iraqi Arabic / MSA / English OK) |
| `conversationId` | string | no | Continue an existing thread |
| `attachmentUrls` | string[] | no | Public Blob/URLs already uploaded |
| `attachments` | `{ url, name?, contentType?, size? }[]` | no | Richer multimodal metadata |
| `idempotencyKey` | string | no | Deduplicate retries |

**Response:** `reply`, `conversationId`, `executionId`, `status`, `timeline[]`, `approvalIds[]`, `artifacts[]?`

`artifacts` items: `{ url, name, title?, contentType?, format?, kind }` when the agent created a downloadable document via `create_document`.

---

### `POST /api/agent/files` (multipart)

| Field | Type | Notes |
|-------|------|--------|
| `file` | File | Max 25MB |
| `process` | string | `"true"` (default) runs OCR/transcribe when AI configured |

**Response:** `url`, `name`, `contentType`, `size`, `processed`

---

### Tool: `create_document`

Used by the model when the user asks for a professional file (report, letter, CSV table, PDF, markdown). Formats: `md` | `csv` | `txt` | `json` | `pdf`. Uploads to Blob under `u-agent/docs` and returns a public URL in `artifacts`.

---

## Flutter (ChatGPT-style overlay)

U Agent is **not** a bottom-nav tab. Dashboards show a small FAB **5px above** the bottom nav with a sliding **“U Agent”** label. Opening it **hides the bottom navigation bar**.

- ChatGPT-like Advanced Voice mode (orb UI, continuous listen → reply → speak)
- Per-user conversation history: `GET /api/agent/conversations` + message load via activity, plus local cache
- Attach photo / camera / files; open/share `artifacts`

### `GET /api/agent/conversations`

Returns the signed-in user's conversations (newest first): `id`, `title`, `status`, `messageCount`, timestamps.

---

### `GET/PATCH /api/agent/whatsapp/consent`

Per-user WhatsApp opt-in. U Agent **cannot** send messages, files, or open calls until the user grants permission in the app.

**PATCH body:** `{ granted?, canSendMessages?, canSendFiles?, canStartCalls? }`

Tools (user consent only — **no workspace admin approval**): `whatsapp_send_message`, `whatsapp_send_file`, `whatsapp_start_call`.

Also: `list_contacts` (workspace directory), `telegram_send_message` (immediate; needs `TELEGRAM_BOT_TOKEN` for Bot API, otherwise returns `t.me` deep links).

Uses Meta Cloud API when `WHATSAPP_CLOUD_ACCESS_TOKEN` + `WHATSAPP_CLOUD_PHONE_NUMBER_ID` are set; otherwise returns secure `wa.me` deep links for the user’s personal WhatsApp.

Document downloads use **`https://proviser.usmart-iot.com/api/public/u-agent-file/...`** (not raw Vercel Blob URLs).

---

### `GET /api/agent/activity`

| Query | Notes |
|-------|--------|
| `conversationId` | If set, returns messages for that thread |
| `limit` | 1–100 (default 40) |

---

### `GET /api/agent/approvals`

Pending approvals (owner/manager sees workspace; others see own).

### `POST /api/agent/approvals/:id/approve`

### `POST /api/agent/approvals/:id/reject`

---

### `GET /api/agent/policy` · `PATCH /api/agent/policy`

Workspace owner policy: `enabled`, `autonomyLevel` (0–2 in Phase 1 UI), `allowedTools`, spend limits, `whatsappIngressEnabled`.

---

### `GET /api/agent/reports/daily`

Daily KPI-style report for the workspace (Asia/Baghdad). Requires KPI/owner capability.

---

## WhatsApp ingress

`POST /api/webhooks/whatsapp` (Meta Cloud). After signature verify, messages are routed to U Agent when:

1. Sender phone matches an active `TicketRequester`
2. Their `PrivateCompany` policy has `whatsappIngressEnabled: true`

Env: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_CLOUD_APP_SECRET`

---

## Tickets via U Agent (all roles)

Every authenticated Proviser role can use U Agent to:

| Tool | Who | What happens |
|------|-----|----------------|
| `list_ticket_types` | all | Lists workspace + platform techniques/services |
| `create_ticket` | all | Creates a ticket request |
| `create_ticket_type` | all (workspace) | Requests a **new** service/type when missing |

**Approval rules (tell the user clearly):**

1. **Workspace users** — `create_ticket` is always **PENDING APPROVAL** until an owner/manager approves. Agent must say pending, never “created live”.
2. **Missing service/type** — agent calls `list_ticket_types`, then `create_ticket_type` (and still queues the ticket). Both stay **PENDING** until approved. After approval, the new `PrivateCompanyTechnique` becomes active.
3. **Personal (no workspace)** — ticket can be created immediately; custom types are not stored as company techniques.

Owner/manager reviews via `/api/agent/approvals` (or Proviser U Agent UI).

---

## Managing AI providers (Admin)

1. Open **Admin → U Agent AI Providers** (`/admin/ai-providers`)
2. Click a preset: **OPENAI**, **DEEPSEEK**, **CLAUDE**, or **CUSTOM**
3. Paste API key, set models (fast / reason / vision / **transcribe**), mark **Default for U Agent**
4. Save — keys are **AES-GCM encrypted** (secret from `U_AGENT_SECRETS_KEY` or `JWT_SECRET`)

| Kind | Base URL (typical) | Notes |
|------|--------------------|--------|
| OPENAI | `https://api.openai.com/v1` | Also env fallback `OPENAI_API_KEY` |
| DEEPSEEK | `https://api.deepseek.com` | OpenAI-compatible chat; no native Whisper |
| CLAUDE | `https://api.anthropic.com` | Anthropic Messages API; vision via Claude; no Whisper |
| CUSTOM | Your gateway `/v1` | Any OpenAI-compatible chat completions API |

### Model slots (what to put where)

| Field | Purpose | OpenAI example | DeepSeek | Claude |
|-------|---------|----------------|----------|--------|
| `modelFast` | Tool loops, quick replies | `gpt-4o-mini` | `deepseek-chat` | `claude-3-5-haiku-latest` |
| `modelReason` | Harder planning | `gpt-4o` or `o4-mini` | `deepseek-reasoner` | `claude-sonnet-4-20250514` |
| `modelVision` | Images / OCR path | `gpt-4o` | leave empty or use a vision-capable gateway | same as reason Sonnet |
| `modelTranscribe` | Server audio → text (`POST /api/agent/files`) | `whisper-1` | leave empty (use Flutter STT or OpenAI secondary) | leave empty |

**Activate sound / voice:**

| Layer | How it works | What you configure |
|-------|----------------|--------------------|
| Flutter Advanced Voice | On-device STT (`speech_to_text`) → agent text → on-device TTS | Mic permission on device; no server model required for chat voice |
| Server file transcription | Upload audio via `/api/agent/files` with `process=true` | Set `modelTranscribe` on the **default** provider (OpenAI `whisper-1` recommended) |
| Chat model for spoken replies | Same as text chat | Default provider `modelFast` / `modelReason` |

**Recommended OpenAI setup (chat + vision + sound):**

1. Preset **OPENAI** → paste `sk-...`
2. Models: fast `gpt-4o-mini`, reason `gpt-4o`, vision `gpt-4o`, transcribe `whisper-1`
3. Enable + **Default for U Agent** → Save
4. On iPhone: open U Agent → tap voice orb (mic must be allowed)

**Other providers:**

- **DeepSeek / Claude as default:** great for text/tools; for uploaded voice notes, either leave `modelTranscribe` empty (Flutter voice still works on-device) or add a second OpenAI provider (not default) and later route transcribe to it — today transcription uses the **default** provider’s `modelTranscribe` when set.
- **CUSTOM gateway:** point `baseUrl` at your OpenAI-compatible `/v1`; set model names your gateway expects. For Whisper-compatible audio, gateway must expose `audio/transcriptions`.

**Admin API:**

- `GET/POST /api/admin/ai-providers`
- `PATCH/DELETE /api/admin/ai-providers/:id`

POST body example (OpenAI with sound):

```json
{
  "name": "OpenAI Prod",
  "slug": "openai",
  "kind": "OPENAI",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "modelFast": "gpt-4o-mini",
  "modelReason": "gpt-4o",
  "modelVision": "gpt-4o",
  "modelTranscribe": "whisper-1",
  "isDefault": true,
  "enabled": true,
  "priority": 10
}
```

DeepSeek example:

```json
{
  "name": "DeepSeek Prod",
  "slug": "deepseek",
  "kind": "DEEPSEEK",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "sk-...",
  "modelFast": "deepseek-chat",
  "modelReason": "deepseek-reasoner",
  "isDefault": true,
  "enabled": true,
  "priority": 10
}
```

U Agent always uses the **default enabled** provider (then priority order). No provider in DB → falls back to `OPENAI_API_KEY`.

---

## Feature flags / env

| Variable | Purpose |
|----------|---------|
| `U_AGENT_ENABLED` | Global on/off (`false` disables agent APIs) |
| `OPENAI_API_KEY` | Fallback when no admin provider |
| `U_AGENT_SECRETS_KEY` | Prefer for encrypting stored API keys |
| `U_AGENT_MODEL_*` | Env model overrides for fallback |

---

## Migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

Relevant migrations:

- `20260914010000_u_agent_foundation`
- `20260914020000_u_agent_whatsapp_ingress`
- `20260914030000_u_agent_ai_providers`
- `20260914040000_u_agent_whatsapp_consent`

---

## Phase roadmap (next)

**Shipped:** tools + approvals; tickets for **all roles**; `create_ticket_type` with pending/approved messaging; multimodal files; WhatsApp consent; multi-provider admin (incl. transcribe); Flutter voice + history + FAB.

**Next:** richer PDF/Arabic fonts; CRM/calendar; Telegram; usage metering UI; optional Realtime voice API; R2 storage option.
