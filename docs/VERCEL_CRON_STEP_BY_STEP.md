# Add Cron Job to Vercel – Step by Step

This guide walks you through adding the Coordinator task-generation cron job to your Vercel project.

---

## Step 1: Create or update `vercel.json`

1. Open your project **root** (same folder as `package.json`).
2. Create a file named **`vercel.json`** if it does not exist, or open it if it does.
3. Add a **`crons`** section like this:

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

If you already have other keys in `vercel.json` (e.g. `rewrites`), keep them and add only the `crons` array:

```json
{
  "rewrites": [...],
  "crons": [
    {
      "path": "/api/coordinator/cron/generate-tasks",
      "schedule": "0 9 * * *"
    }
  ]
}
```

- **path** – Must be exactly: `/api/coordinator/cron/generate-tasks`
- **schedule** – Cron in UTC. `0 9 * * *` = every day at 9:00 AM UTC.  
  For **9:00 AM Iraq (UTC+3)** use: `0 6 * * *`

You can copy from **`vercel.json.example`** in the repo.

---

## Step 2: Generate a secret

On your computer, run:

```bash
openssl rand -hex 32
```

Copy the output (a long hex string). You will use it in the next step.

---

## Step 3: Add the secret in Vercel

1. Go to [vercel.com](https://vercel.com) and open your **project**.
2. Click **Settings**.
3. In the left sidebar, click **Environment Variables**.
4. Click **Add New** (or **Add**).
5. Set:
   - **Key:** `CRON_SECRET`
   - **Value:** paste the secret you generated in Step 2
   - **Environments:** select at least **Production** (cron runs only in production)
6. Click **Save**.

Vercel will send this value in the `Authorization: Bearer ...` header when it runs your cron. Our API checks it and returns 401 if it does not match.

---

## Step 4: Commit and deploy

1. Save `vercel.json` and commit:

   ```bash
   git add vercel.json
   git commit -m "Add Vercel cron for coordinator task generation"
   git push
   ```

2. Vercel will build and deploy. Wait for the **production** deployment to finish.

Cron jobs run only on **production**; they do not run on preview deployments.

---

## Step 5: Check that the cron is registered

1. In Vercel, open your **project**.
2. Go to **Settings**.
3. Find **Cron Jobs** in the sidebar (or under **Functions** / your plan’s cron section).
4. You should see one job:
   - **Path:** `/api/coordinator/cron/generate-tasks`
   - **Schedule:** `0 9 * * *` (or whatever you set)

If you do not see Cron Jobs, your Vercel plan may not include them (e.g. Hobby). In that case use an external cron service and see the main doc: [COORDINATOR_CRON_SETUP.md](./COORDINATOR_CRON_SETUP.md).

---

## Step 6: (Optional) Test the endpoint

To confirm the endpoint works without waiting for the schedule:

```bash
curl -i "https://YOUR_VERCEL_URL.vercel.app/api/coordinator/cron/generate-tasks" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Replace:

- `YOUR_VERCEL_URL` with your production domain (e.g. `usmart` or full domain).
- `YOUR_CRON_SECRET` with the same value you set in Step 3.

You should get **200 OK** and JSON like:

```json
{ "success": true, "generated": 0, "taskIds": [] }
```

If you get **401 Unauthorized**, the secret does not match the one in Vercel.

---

## Step 7: Match Job Duty templates to the schedule

Tasks are only created when the **template’s cron expression** matches the **time the cron runs**.

- Your Vercel cron runs at the time in `schedule` (e.g. 9:00 UTC).
- In the Coordinator dashboard, open **واجبات الوظيفة** (Job Duties) and create or edit a template.
- Set the template’s cron to the **same** minute and hour. For a daily 9:00 UTC run, use: **`0 9 * * *`**.

If the template cron does not match the run time, no task is created that run.

---

## Summary

| Step | What to do |
|------|------------|
| 1 | Add `vercel.json` with `crons` → path `/api/coordinator/cron/generate-tasks`, schedule e.g. `0 9 * * *`. |
| 2 | Run `openssl rand -hex 32` and copy the secret. |
| 3 | In Vercel → Settings → Environment Variables, add `CRON_SECRET` with that value (Production). |
| 4 | Commit `vercel.json`, push, and wait for production deploy. |
| 5 | In Vercel → Settings → Cron Jobs, confirm the job is listed. |
| 6 | (Optional) Test with `curl` and `Authorization: Bearer YOUR_SECRET`. |
| 7 | In the Coordinator dashboard, set Job Duty template cron to match (e.g. `0 9 * * *`). |

For more detail (timezones, external cron, troubleshooting), see [COORDINATOR_CRON_SETUP.md](./COORDINATOR_CRON_SETUP.md).
