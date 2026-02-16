# Coordinator Voice & Language Setup

This guide covers voice features for the Digital Coordinator: in-app assistant, Twilio incoming calls, voice logs/call records, and optional server-side STT (e.g. for Iraqi dialect or file-based transcription).

---

## 1. In-app Voice Assistant

**What it is:** A floating microphone button on every coordinator dashboard page. Users can start browser Speech Recognition (Arabic, `ar-SA`), see a live transcript, edit it, then either save to **Voice logs** or create a **Task** from the text.

**Requirements:** A browser that supports the Web Speech API (e.g. Chrome, Edge). No server configuration needed.

**Flow:**
- Click the mic button → panel opens.
- Click “بدء الاستماع” → speak → transcript appears (and can be edited).
- “حفظ في سجل الصوت” → POST to `/api/coordinator/voice-logs` (transcript + `detectedLanguage: ar-SA`).
- “إنشاء مهمة من هذا النص” → redirects to Tasks with the transcript prefilled as the new task title.

---

## 2. Twilio Incoming Calls

**What it is:** When someone calls your Twilio number, Twilio sends an HTTP request to your webhook. The app creates a **Voice call record** (INCOMING) and responds with TwiML (e.g. a short Arabic greeting and hang up).

**Steps:**

1. **Twilio Console**
   - Get a phone number (or use an existing one).
   - Under **Voice & Fax** → “A CALL COMES IN”:
     - Set to **Webhook**.
     - URL: `https://yourdomain.com/api/coordinator/voice/webhook/incoming`
     - Method: **POST**.

2. **Environment variables** (optional but recommended)
   - `TWILIO_AUTH_TOKEN` – From Twilio Console. Used to validate that requests really come from Twilio (recommended in production).
   - `TWILIO_COORDINATOR_COMPANY_ID` – The coordinator company ID to attach incoming call records to. If not set, the first company in the database is used.

3. **Verification**
   - Call your Twilio number; you should hear the Arabic greeting and then the call end. A new row should appear under **المكالمات والصوت** → سجل المكالمات.

---

## 3. Voice Logs & Call Records

- **Voice logs** (`/api/coordinator/voice-logs`): Per-user log of transcripts (from the in-app assistant or future STT). Stored in `CoordinatorVoiceLog` (transcript, detectedLanguage, intent, actionTaken, etc.).
- **Voice call records** (`/api/coordinator/voice-call-records`): Per-company list of incoming/outgoing call metadata. Stored in `CoordinatorVoiceCallRecord` (direction, duration, transcript, status, taskLinked).

Dashboard: **المكالمات والصوت** (`/coordinator/voice`) shows both tabs.

---

## 4. Server-side STT / Iraqi Dialect (Optional)

For **server-side transcription** (e.g. uploaded audio, or Twilio recording URLs), you can add a step that sends audio to a speech-to-text service (e.g. OpenAI Whisper) and optionally detects intent or language (Iraqi vs formal Arabic vs English).

**Current state:**
- The in-app assistant uses **browser** Speech Recognition; no server config required.
- **Server-side STT** is implemented: `POST /api/coordinator/voice/transcribe`. It is intended for authenticated coordinator users to send audio (e.g. base64 or URL) and receive a transcript. If `OPENAI_API_KEY` is not set (and the `openai` package is not used), the route returns a clear “not configured” response.

Set `OPENAI_API_KEY` in your environment to enable; the route is already implemented with Whisper.

**Iraqi dialect / intent:**  
Whisper can transcribe Iraqi Arabic. For “intent” (e.g. “create task” vs “ask for report”), you can add a second step: send the transcript to an LLM or a small classifier with instructions to detect intent and language (Iraqi / formal Arabic / EN), then store `intent` and `detectedLanguage` on the voice log and optionally trigger actions (e.g. create task, send notification).

**TTS (text-to-speech):**  
For voice responses (e.g. “تم إنشاء المهمة”), use a TTS API (e.g. AWS Polly, or OpenAI TTS if available) and return the audio URL or stream in your TwiML or in-app flow. Not implemented in the codebase yet; the Twilio webhook currently uses static TwiML `<Say>` only.

---

## 5. Summary

| Feature              | Config needed                         | Route / UI                                      |
|----------------------|---------------------------------------|-------------------------------------------------|
| In-app voice         | None (browser only)                   | Floating mic → VoiceAssistant panel            |
| Twilio incoming      | Twilio number + webhook URL; optional: `TWILIO_AUTH_TOKEN`, `TWILIO_COORDINATOR_COMPANY_ID` | `POST /api/coordinator/voice/webhook/incoming` |
| Voice logs           | None                                  | `GET/POST /api/coordinator/voice-logs`, Voice page |
| Call records         | None (or Twilio for incoming)          | `GET/POST /api/coordinator/voice-call-records`, Voice page |
| Server-side STT      | Set `OPENAI_API_KEY`                  | `POST /api/coordinator/voice/transcribe` (Whisper)                  |

For **Iraqi dialect / language** and **voice-to-task**, use the in-app assistant (browser, ar-SA) today; add Whisper + intent + TTS when you are ready to configure the optional server-side pipeline as in section 4.
