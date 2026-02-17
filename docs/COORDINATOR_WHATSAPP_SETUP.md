# Coordinator WhatsApp Setup

This guide explains how to give the **coordinator a WhatsApp number** so she can receive and send messages (tasks from WhatsApp, replies from the dashboard).

---

## 1. Overview

- **Inbound:** When someone sends a WhatsApp message to the coordinator number, Twilio forwards it to your app. The app creates a **task** with `source: 'whatsapp'` and stores the sender’s number for follow-up. The sender gets an immediate reply with a **tracking reference** (e.g. `رقم المتابعة: #ABC123`) and a note that updates will be sent to that number.
- **Tracking and follow-up:** Each request has a short reference (last 6 chars of task id). The coordinator sees the task in **المهام**, works on it (e.g. calls Ahmed), then adds **تغذية راجعة منسق** and clicks **حفظ وإرسال للمرسل**. That feedback is sent to the original sender on WhatsApp, prefixed with `[متابعة #ABC123]` so they can match it to their request.
- **Outbound:** Admins can send WhatsApp messages from the dashboard (**المكالمات والصوت** → “إرسال رسالة واتساب”) using the same coordinator number.
- **Contact:** The coordinator’s WhatsApp number is shown on the Voice page (“تواصل المنسق عبر واتساب”) with a link to open a chat (wa.me).

---

## 2. Get a WhatsApp number (Twilio)

You can use either the **Twilio Sandbox** (testing) or **WhatsApp Business API** (production).

### Option A – Twilio WhatsApp Sandbox (quick testing)

1. Log in to [Twilio Console](https://console.twilio.com).
2. Go to **Messaging** → **Try it out** → **Send a WhatsApp message** (or **Explore** → **WhatsApp**).
3. Open the **Sandbox** tab. You’ll see a sandbox number (e.g. +1 415 523 8886) and a **join code** (e.g. `join happy-tiger`).
4. On your phone, open WhatsApp and send that join code to the sandbox number. After that, you can send and receive messages to/from that number.
5. Note:
   - **Sandbox “From” value:** `whatsapp:+14155238886` (use the number shown in your sandbox; format is always `whatsapp:+...`).
   - This number is only for testing; real users must “join” the sandbox.

### Option B – WhatsApp Business API (production)

1. In Twilio: **Messaging** → **WhatsApp** → **Senders** (or **Request access** to WhatsApp if needed).
2. Request a **WhatsApp Business** number and complete Meta’s approval.
3. Once approved, you get a number (e.g. `whatsapp:+964...`) that anyone can message without joining a sandbox.

Use the **From** value Twilio gives you (e.g. `whatsapp:+14155238886` for sandbox or `whatsapp:+964...` for production) as `TWILIO_WHATSAPP_FROM` below.

---

## 3. Environment variables

Set these in `.env` (local) and in your host (e.g. Vercel):

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes (for send) | From Twilio Console → Account. |
| `TWILIO_AUTH_TOKEN` | Yes (for send + webhook validation) | From Twilio Console → Account. |
| `TWILIO_WHATSAPP_FROM` | Yes (for send + display) | The coordinator’s WhatsApp “From” (e.g. `whatsapp:+14155238886` for sandbox). |
| `TWILIO_COORDINATOR_COMPANY_ID` | Optional | Company to attach inbound WhatsApp tasks to; if unset, first company is used. |

Same `TWILIO_AUTH_TOKEN` is used to **validate** incoming webhooks (so only Twilio can trigger task creation).

---

## 4. Configure Twilio webhook (inbound)

So that messages **to** the coordinator number create tasks in your app:

1. In Twilio: **Messaging** → **WhatsApp** → **Sandbox settings** (or your WhatsApp Sender) → **When a message comes in**.
2. Set:
   - **URL:** `https://yourdomain.com/api/coordinator/inbound/whatsapp`
   - **Method:** `POST`
3. Save.

Twilio sends `application/x-www-form-urlencoded` with `From`, `To`, `Body`, etc. The app validates the request using `X-Twilio-Signature` and `TWILIO_AUTH_TOKEN`, then creates a task with `source: 'whatsapp'`.

---

## 5. What the app does

- **Inbound:** `POST /api/coordinator/inbound/whatsapp`  
  - Accepts Twilio’s form body and optional JSON (for other providers).  
  - Validates Twilio signature when `TWILIO_AUTH_TOKEN` is set.  
  - Creates one **CoordinatorTask** per message (title from first line of body, description includes sender and full text).

- **Contact (display):** `GET /api/coordinator/whatsapp/contact`  
  - Returns the coordinator number (from `TWILIO_WHATSAPP_FROM`, stripped of `whatsapp:` for display and wa.me links).  
  - Requires coordinator login.

- **Send (admin):** `POST /api/coordinator/whatsapp/send`  
  - Body: `{ "to": "+9647712345678", "body": "نص الرسالة" }`.  
  - Sends from `TWILIO_WHATSAPP_FROM` via Twilio.  
  - Admin role required.

---

## 6. Dashboard

- **المكالمات والصوت** (`/coordinator/voice`):
  - If `TWILIO_WHATSAPP_FROM` is set, a green card shows **“تواصل المنسق عبر واتساب”** with the number and a **“فتح واتساب”** button (wa.me).
  - **“إرسال رسالة واتساب (مسؤول فقط)”**: form to send a message to a phone number (E.164, e.g. +9647712345678). Only admins can send; others get a “مسؤول فقط” message.

---

## 7. Checklist

- [ ] Twilio account; WhatsApp Sandbox or WhatsApp Business number.
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (and optionally `TWILIO_COORDINATOR_COMPANY_ID`).
- [ ] In Twilio, set “When a message comes in” to `https://yourdomain.com/api/coordinator/inbound/whatsapp`, method POST.
- [ ] For Sandbox: join the sandbox from your phone with the code Twilio shows.
- [ ] Test: send a WhatsApp message to the coordinator number → a new task should appear in **المهام** with source واتساب.
- [ ] Test: open Voice page → see “تواصل المنسق عبر واتساب” and “فتح واتساب”; as admin, send a test message.

See also: [COORDINATOR_ENV.md](./COORDINATOR_ENV.md), [COORDINATOR_INBOUND_CHANNELS.md](./COORDINATOR_INBOUND_CHANNELS.md).
