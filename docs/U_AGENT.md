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

## Managing AI providers (Admin)

1. Open **Admin → U Agent AI Providers** (`/admin/ai-providers`)
2. Click a preset: **OPENAI**, **DEEPSEEK**, **CLAUDE**, or **CUSTOM**
3. Paste API key, adjust models / base URL, mark **Default for U Agent**
4. Save — keys are **AES-GCM encrypted** (secret from `U_AGENT_SECRETS_KEY` or `JWT_SECRET`)

| Kind | Base URL (typical) | Notes |
|------|--------------------|--------|
| OPENAI | `https://api.openai.com/v1` | Also env fallback `OPENAI_API_KEY` |
| DEEPSEEK | `https://api.deepseek.com` | OpenAI-compatible |
| CLAUDE | `https://api.anthropic.com` | Anthropic Messages API |
| CUSTOM | Your gateway `/v1` | Any OpenAI-compatible chat completions API |

**Admin API:**

- `GET/POST /api/admin/ai-providers`
- `PATCH/DELETE /api/admin/ai-providers/:id`

POST body example:

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

---

## Phase roadmap (next)

**Shipped (Phase 0–2 + voice/docs UX):** tools, approvals, multimodal files, WhatsApp ingress, multi-provider admin, Flutter WhatsApp-style overlay with STT/TTS + `create_document`.

**Phase 3 (in progress / next):** conversation list API + ChatGPT voice UX (shipped in app); richer PDF/Arabic fonts; CRM/calendar tools; Telegram channel; voice-note upload transcription; usage metering UI; R2 storage option.
