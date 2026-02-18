# Coordinator CRON Setup – Task Generation

This document explains **COORDINATOR_CRON_SECRET** and how to set up the cron job that auto-generates tasks from Job Duty templates.

---

## 1. What is COORDINATOR_CRON_SECRET?

**You choose the value.** It is not provided by Vercel or any service. It is a **secret string** that only your cron job and your app should know, so that random users cannot trigger task generation by calling the endpoint.

### How to generate a value

**Option A – random string (recommended)**

```bash
openssl rand -hex 32
```

Example result: `a1b2c3d4e5f6...` (64 characters). Use that as `COORDINATOR_CRON_SECRET`.

**Option B – any strong secret**

Use any long, random string (e.g. 32+ characters), different from your JWT or other secrets.

### Where to set it

- **Local:** in `.env` as `COORDINATOR_CRON_SECRET=your_generated_value`
- **Vercel:** Project → Settings → Environment Variables → add `COORDINATOR_CRON_SECRET` with the same value (Production / Preview / Development as needed)

**If you leave it empty:** the endpoint does **not** check the secret (anyone could call it). Only leave empty for local testing; in production always set it.

---

## 2. How the endpoint is secured

- **Endpoint:** `GET /api/coordinator/cron/generate-tasks`
- The route checks:
  - **Header:** `Authorization: Bearer YOUR_SECRET`, or
  - **Query:** `?secret=YOUR_SECRET`
- If `COORDINATOR_CRON_SECRET` (or `CRON_SECRET`) is set and the request does not send that value, the response is **401 Unauthorized**.

So: **value of COORDINATOR_CRON_SECRET** = the exact string you put in the env and the one you send in the cron request (header or query).

**Monthly report cron:** `GET /api/coordinator/cron/monthly-report` uses the same secret. When called (e.g. 1st of each month at 9:00 UTC via `vercel.json`), it creates one **monthly** report per company for the previous month. Schedule: `0 9 1 * *`.

**Daily performance cron:** `GET /api/coordinator/cron/daily-performance` uses the same secret. When called (e.g. daily at 8:00 UTC via `vercel.json`), it creates a **daily** report per company and notifies all company admins with a team performance and KPI summary. Schedule: `0 8 * * *`. Admins can also trigger it from the Reports page (“ملخص الأداء اليومي الآن”) via `POST /api/coordinator/cron/daily-performance`.

---

## 3. When are tasks actually created?

- The cron job calls the endpoint at a **fixed time** (e.g. every day at 9:00 AM).
- The server uses **current server time** (e.g. on Vercel, **UTC**).
- For each **Job Duty template**, the stored **cron expression** (e.g. `0 9 * * *`) is compared to that current time.
- **Only if the expression matches** (same minute and hour, and day/month/week if not `*`), a task is created for that template.

So:

- If the cron runs **once per day at 9:00 UTC**, only templates whose expression is **`0 9 * * *`** (9:00 every day) will generate a task on that run.
- If you want **9:00 Iraq time** (e.g. UTC+3), that is 6:00 UTC, so:
  - Run the cron at **6:00 UTC**, and
  - Set templates to **`0 6 * * *`** (so they match 6:00 UTC = 9:00 Iraq).

**Important:** The **time the cron trigger runs** and the **cron expression stored in each template** must align (same minute and hour in the same timezone).

---

## 4. Vercel Cron (recommended if you host on Vercel)

**→ For a full step-by-step guide:** [Add Cron Job to Vercel – Step by Step](./VERCEL_CRON_STEP_BY_STEP.md)

### Step 1: Add the cron schedule

In the project root, create `vercel.json` (or copy from `vercel.json.example`):

```json
{
  "crons": [
    {
      "path": "/api/coordinator/cron/generate-tasks",
      "schedule": "0 9 * * *"
    }
  ]
}
```

- `"0 9 * * *"` = every day at **09:00 UTC** (minute 0, hour 9).
- For 9:00 Iraq (UTC+3), use **`0 6 * * *`** (6:00 UTC).

Vercel will call your app at that time. Set **CRON_SECRET** or **COORDINATOR_CRON_SECRET** in Vercel Environment Variables; Vercel sends it in the `Authorization` header when invoking the cron path.

### Step 2: Pass the secret in the URL

Vercel Cron does not let you set query parameters in the UI. So you have two options:

**Option A – Secret in env only (no query)**

- In the route, if the request comes from Vercel Cron, it often has a special header. You can **relax the check when that header is present** and the request is from Vercel (so only Vercel’s cron can hit it without a secret). This is optional and depends on your security requirements.

**Option B – Use a server-side secret and a proxy (recommended)**

- Keep the endpoint as-is (it reads `COORDINATOR_CRON_SECRET` from env and accepts `?secret=...` or `Authorization: Bearer ...`).
- Vercel Cron only allows a single URL per cron; it does not add query params. So in practice you have to either:
  - Use **Vercel’s “Cron Secret”** (if available in your plan) and match it to `COORDINATOR_CRON_SECRET`, or
  - Call the endpoint **from another cron service** that can send the secret (see “External cron” below).

**Option C – Vercel Cron + middleware / rewrite**

- Some setups use a rewrite so the cron hits an internal URL that includes the secret from env. That requires custom server/middleware and is more involved.

**If you use Vercel Cron (vercel.json):**  
Vercel can send an `Authorization: Bearer <token>` when invoking cron. The token is the value of the env var **`CRON_SECRET`** (in the Vercel project). So:

- In Vercel → Settings → Environment Variables, set **`CRON_SECRET`** (or **`COORDINATOR_CRON_SECRET`**) to the same secret value.
- The endpoint accepts both `CRON_SECRET` and `COORDINATOR_CRON_SECRET`; if Vercel sends `CRON_SECRET` in the request, keep that variable set so the check passes.

So for Vercel Cron: **value of COORDINATOR_CRON_SECRET** = any strong secret you generate; set it (or `CRON_SECRET`) in Vercel env so the cron request is authorized.

**Practical alternative:**  
Use an **external cron service** (below) that can call your URL with `?secret=YOUR_COORDINATOR_CRON_SECRET`. Then the secret is only in your app env and in that scheduler.

---

## 5. External cron (any host or Vercel)

Use any scheduler that can send a GET request to your app with the secret.

### Example: cron-job.org

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Create a new cron job:
   - **URL:**  
     `https://your-domain.com/api/coordinator/cron/generate-tasks?secret=YOUR_COORDINATOR_CRON_SECRET`  
     (replace `YOUR_COORDINATOR_CRON_SECRET` with the same value as in your env)
   - **Schedule:** e.g. daily at 9:00 AM (choose your timezone).
   - **Request method:** GET.

### Example: GitHub Actions

```yaml
# .github/workflows/coordinator-cron.yml
on:
  schedule:
    - cron: '0 6 * * *'   # 6:00 UTC = 9:00 Iraq
  workflow_dispatch:
jobs:
  generate-tasks:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger task generation
        run: |
          curl -s -o /dev/null -w "%{http_code}" \
            "https://your-domain.com/api/coordinator/cron/generate-tasks?secret=${{ secrets.COORDINATOR_CRON_SECRET }}"
```

Add `COORDINATOR_CRON_SECRET` in the repo’s **Secrets** (same value as in your app env).

### Example: Manual test with curl

```bash
# Replace with your secret and domain
export SECRET="your_64_char_hex_or_strong_secret"
curl -i "https://your-domain.com/api/coordinator/cron/generate-tasks?secret=$SECRET"
# Or with header:
curl -i -H "Authorization: Bearer $SECRET" "https://your-domain.com/api/coordinator/cron/generate-tasks"
```

Expected: `200 OK` and JSON like `{ "success": true, "generated": 0, "taskIds": [] }` (or `generated > 0` if templates matched).

---

## 6. Template cron expressions – quick reference

Stored in each Job Duty template (e.g. in dashboard “واجبات الوظيفة” or via API).

| You want        | Cron expression | When it runs (if cron job runs at that time) |
|-----------------|-----------------|-----------------------------------------------|
| Daily 9:00      | `0 9 * * *`     | Every day at 9:00 (server timezone)           |
| Weekly Sunday 9 | `0 9 * * 0`     | Sunday 9:00                                   |
| Monthly 1st 9   | `0 9 1 * *`     | First day of month at 9:00                    |
| Yearly Jan 1 9  | `0 9 1 1 *`     | 1 January at 9:00                             |

**Rule:** The **scheduler** (Vercel Cron or external) must call the endpoint at the **same** minute (and hour) as in the template. So if you run the cron at **9:00 UTC**, use **`0 9 * * *`** for daily templates.

---

## 7. Checklist

- [ ] Generate a strong secret (e.g. `openssl rand -hex 32`).
- [ ] Set `COORDINATOR_CRON_SECRET` in `.env` (local) and in Vercel (or your host) env vars.
- [ ] Choose: Vercel Cron (vercel.json) or external cron (cron-job.org, GitHub Actions, etc.).
- [ ] If external: call `GET .../api/coordinator/cron/generate-tasks?secret=YOUR_SECRET` (or `Authorization: Bearer YOUR_SECRET`) on the desired schedule.
- [ ] Align schedule and timezone: e.g. run at 6:00 UTC for 9:00 Iraq; use template expression `0 6 * * *` for “daily at that time”.
- [ ] Create at least one Job Duty template in the coordinator dashboard with a matching cron expression.
- [ ] Test once with curl or “Run now” in the external cron; check response and that tasks appear in the dashboard.

---

## 8. Summary: value of COORDINATOR_CRON_SECRET

- **Value:** A long random string **you generate** (e.g. 64-char hex from `openssl rand -hex 32`).
- **Purpose:** So only your cron job (or you) can call the task-generation endpoint.
- **Where:** In environment variables (local and production). Same value is used in the cron request as `?secret=...` or `Authorization: Bearer ...`.

---

## 9. Prisma warning during build/cron

If you see:

```text
prisma:warn In production, we recommend using `prisma generate --no-engine`
```

**You can ignore it.** It is a recommendation for setups that use Prisma’s serverless/edge driver adapters. This project uses the default Prisma Client with the bundled engine, which works on Vercel. Do **not** add `--no-engine` to your build script unless you switch to a driver adapter (e.g. `@prisma/adapter-pg`), or the app may fail at runtime with “Engine not found”.
