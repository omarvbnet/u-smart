# Coordinator – Environment Variables

Single reference for all environment variables used by the Digital Coordinator (`/coordinator`).

| Variable | Required | Used by |
|----------|----------|---------|
| `DATABASE_URL` | Yes | All coordinator APIs (Prisma). |
| `COORDINATOR_JWT_SECRET` | Yes (prod) | Coordinator login; signs JWT. Falls back to `JWT_SECRET` if unset. |
| `COORDINATOR_PASSWORD_SALT` | Yes (prod) | Password hashing on coordinator login. |
| `COORDINATOR_CRON_SECRET` or `CRON_SECRET` | Yes (prod) | `GET /api/coordinator/cron/generate-tasks` and `GET /api/coordinator/cron/monthly-report`. Send as `Authorization: Bearer <secret>` or `?secret=<secret>`. |
| `OPENAI_API_KEY` | Optional | Voice: `POST /api/coordinator/voice/transcribe` (Whisper). AI: `POST /api/coordinator/ai/compose-message`, `POST /api/coordinator/ai/rewrite`. |
| `BLOB_READ_WRITE_TOKEN` | Optional | Report PDF: when set, `POST .../reports/[id]/generate-pdf` uploads PDF to Vercel Blob and sets `report.pdfUrl`. Without it, PDF is only returned in the response. |
| `STRIPE_SECRET_KEY` | Optional | Coordinator billing (checkout, subscriptions). |
| `STRIPE_WEBHOOK_SECRET_COORDINATOR` | Optional | Stripe webhook for coordinator billing. |
| `TWILIO_AUTH_TOKEN` | Optional | Validate Twilio webhook for `POST /api/coordinator/voice/webhook/incoming`. |
| `TWILIO_COORDINATOR_COMPANY_ID` | Optional | Which company to attach incoming voice calls to. |

**Quick setup (minimal):**

- `DATABASE_URL` – required.
- `COORDINATOR_JWT_SECRET` and `COORDINATOR_PASSWORD_SALT` – required for coordinator login.
- `COORDINATOR_CRON_SECRET` – required in production if you use Vercel Cron or an external scheduler for task generation and monthly reports.

**Optional features:**

- **Voice (Whisper + AI compose/rewrite):** set `OPENAI_API_KEY`.
- **Report PDF stored in Blob:** set `BLOB_READ_WRITE_TOKEN`.
- **Billing:** set Stripe keys and webhook secret.
- **Voice calls (Twilio):** set Twilio env and webhook URL in Twilio Console.

See also: [COORDINATOR_CRON_SETUP.md](./COORDINATOR_CRON_SETUP.md), [COORDINATOR_VOICE_SETUP.md](./COORDINATOR_VOICE_SETUP.md).
