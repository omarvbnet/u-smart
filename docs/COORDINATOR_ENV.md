# Coordinator – Environment Variables

Single reference for all environment variables used by the Digital Coordinator (`/coordinator`).

| Variable | Required | Used by |
|----------|----------|---------|
| `DATABASE_URL` | Yes | All coordinator APIs (Prisma). |
| `COORDINATOR_JWT_SECRET` | Yes (prod) | Coordinator login; signs JWT. Falls back to `JWT_SECRET` if unset. |
| `COORDINATOR_PASSWORD_SALT` | Yes (prod) | Password hashing on coordinator login. |
| `COORDINATOR_CRON_SECRET` or `CRON_SECRET` | Yes (prod) | `GET /api/coordinator/cron/generate-tasks`, `GET /api/coordinator/cron/monthly-report`, `GET /api/coordinator/cron/daily-performance`. Send as `Authorization: Bearer <secret>` or `?secret=<secret>`. |
| `OPENAI_API_KEY` | Optional | Voice (Whisper), AI compose/rewrite, and **AI coordinator agent**: `POST /api/coordinator/tasks/[id]/ai-process` (suggests task status and generates WhatsApp reply from feedback). |
| `BLOB_READ_WRITE_TOKEN` | Optional | Report PDF: when set, `POST .../reports/[id]/generate-pdf` uploads PDF to Vercel Blob and sets `report.pdfUrl`. Without it, PDF is only returned in the response. |
| `STRIPE_SECRET_KEY` | Optional | Coordinator billing (checkout, subscriptions). |
| `STRIPE_WEBHOOK_SECRET_COORDINATOR` | Optional | Stripe webhook for coordinator billing. |
| `TWILIO_ACCOUNT_SID` | Optional | Required for sending WhatsApp from coordinator (`POST /api/coordinator/whatsapp/send`). |
| `TWILIO_AUTH_TOKEN` | Optional | Validate Twilio voice/WhatsApp webhooks; used to send WhatsApp. |
| `TWILIO_WHATSAPP_FROM` | Optional | Coordinator’s WhatsApp number (e.g. `whatsapp:+14155238886`). Shown on Voice page; used for outbound messages. |
| `TWILIO_COORDINATOR_COMPANY_ID` | Optional | CoordinatorCompany id (from `coordinator_companies`) to attach incoming voice calls and WhatsApp tasks to; if unset, first coordinator company. Must **not** be a main app `Company` id. |
| `COORDINATOR_INBOUND_SECRET` | Optional | Inbound email/WhatsApp webhooks: send as `X-Inbound-Secret` or `Authorization: Bearer <secret>`. If set, requests without it get 401. |

**Quick setup (minimal):**

- `DATABASE_URL` – required.
- `COORDINATOR_JWT_SECRET` and `COORDINATOR_PASSWORD_SALT` – required for coordinator login.
- `COORDINATOR_CRON_SECRET` – required in production if you use Vercel Cron or an external scheduler for task generation and monthly reports.

**Optional features:**

- **Voice (Whisper + AI compose/rewrite):** set `OPENAI_API_KEY`.
- **Report PDF stored in Blob:** set `BLOB_READ_WRITE_TOKEN`.
- **Billing:** set Stripe keys and webhook secret.
- **Voice calls (Twilio):** set Twilio env and webhook URL in Twilio Console.
- **Coordinator WhatsApp:** set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` and configure WhatsApp webhook; see [COORDINATOR_WHATSAPP_SETUP.md](./COORDINATOR_WHATSAPP_SETUP.md).

See also: [COORDINATOR_CRON_SETUP.md](./COORDINATOR_CRON_SETUP.md), [COORDINATOR_VOICE_SETUP.md](./COORDINATOR_VOICE_SETUP.md), [COORDINATOR_WHATSAPP_SETUP.md](./COORDINATOR_WHATSAPP_SETUP.md), [COORDINATOR_INBOUND_CHANNELS.md](./COORDINATOR_INBOUND_CHANNELS.md).
