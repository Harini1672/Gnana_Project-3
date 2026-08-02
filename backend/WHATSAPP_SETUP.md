# WasenderAPI — Setup Guide

This guide explains how to connect your RAG chatbot to **WasenderAPI** so that
real WhatsApp users can message your number and receive AI-generated answers
powered by Pinecone retrieval and Google Gemini.

---

## Prerequisites

| Requirement | Where to get it |
|---|---|
| WasenderAPI account | [app.wasenderapi.com](https://app.wasenderapi.com) |
| A phone number with WhatsApp installed | Any Android / iOS device |
| A publicly reachable HTTPS URL for your backend | ngrok (dev), Render, Railway, EC2, etc. |

---

## Step 1 — Create a WasenderAPI account and session

1. Sign up at [app.wasenderapi.com](https://app.wasenderapi.com).
2. Go to the **Sessions** tab and click **Create New Session**.
3. A QR code appears — open WhatsApp on your phone, go to
   **Settings → Linked Devices** and scan it.
4. Once connected the session status changes to **Active**.
5. Copy the **API Key** shown on the session card — this is your
   `WASENDER_API_KEY`.
6. Note the **Session ID** string — this is your `WASENDER_SESSION_ID`
   (used for reference / logging only).

---

## Step 2 — Configure your .env

Open `backend/.env` and fill in the four WasenderAPI variables:

```env
WASENDER_API_KEY=your-api-key-from-dashboard
WASENDER_SESSION_ID=your-session-id
WASENDER_BASE_URL=https://www.wasenderapi.com      # do not change unless self-hosted
WASENDER_WEBHOOK_SECRET=any-random-secret-string   # you choose this; paste the same value into the dashboard
```

Restart the backend after editing `.env`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Step 3 — Expose your backend publicly (development)

WasenderAPI requires a **public HTTPS URL** to deliver webhook events.
Use [ngrok](https://ngrok.com) during development:

```bash
# Install ngrok, then:
ngrok http 8000
```

ngrok prints a URL like `https://abc123.ngrok-free.app`.
Your webhook endpoint is: `https://abc123.ngrok-free.app/webhook`

> ngrok URLs change on every restart (free tier).
> Use a static domain or a cloud deployment for persistent testing.

---

## Step 4 — Register the webhook in the WasenderAPI dashboard

1. In the dashboard open your session and go to the **Webhooks** tab.
2. Paste your public URL into the **Webhook URL** field:
   ```
   https://<your-domain>/webhook
   ```
3. In the **Webhook Secret** field paste the same random string you put in
   `WASENDER_WEBHOOK_SECRET`.  Wasender will sign every POST with this secret
   so your backend can reject spoofed requests.
4. Under **Events** enable at minimum:
   - `messages.received`
5. Click **Save**.

Unlike Meta, there is **no GET verification handshake** — Wasender starts
delivering events immediately after you save.

---

## Step 5 — Send a test message

1. From any WhatsApp account send a message to the phone number linked to your
   Wasender session.
2. Wasender forwards the event to `POST /webhook` on your backend.
3. The backend verifies the `X-Webhook-Signature` header, runs the RAG
   pipeline (Pinecone → Gemini), and sends the AI answer back through
   `POST https://www.wasenderapi.com/api/send-message`.
4. You receive the AI reply on WhatsApp.

Check backend logs to trace the full flow:

```
INFO  app.routes.webhook  Processing WhatsApp message from 919876543210: 'What is the main topic...'
INFO  app.rag              Calling Gemini model=gemini-2.5-flash  chunks=4
INFO  app.whatsapp         WhatsApp message delivered successfully to +919876543210
```

---

## Step 6 — Production deployment

1. Deploy the backend to a cloud provider (Render, Railway, EC2, etc.) with a
   stable HTTPS domain.
2. Update the Webhook URL in the Wasender dashboard to your production domain.
3. Ensure all four `WASENDER_*` variables are set in your production environment.
4. Keep `WASENDER_WEBHOOK_SECRET` set — never leave it blank in production.

---

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `WASENDER_API_KEY` | Yes | Bearer token for the WasenderAPI REST API. Generated per session in the dashboard. |
| `WASENDER_SESSION_ID` | No | Session identifier. Used for logging and reference only. |
| `WASENDER_BASE_URL` | No | API base URL. Defaults to `https://www.wasenderapi.com`. Override only for self-hosted instances. |
| `WASENDER_WEBHOOK_SECRET` | Recommended | Secret used to verify `X-Webhook-Signature` on incoming webhook POSTs. Must match the value in the dashboard. |

---

## Message flow diagram

```
WhatsApp User
     │
     │  sends message
     ▼
WasenderAPI
     │
     │  POST /webhook  (X-Webhook-Signature header)
     ▼
FastAPI backend  (/webhook)
     │
     ├── verify_webhook_signature()    HMAC-SHA256 check
     ├── _extract_message()            parse sender + text from payload
     │
     │  background task
     ├── get_or_create_chat_session()  Supabase session lookup
     ├── create_message()              persist user message
     ├── perform_rag()                 embed → Pinecone → Gemini
     ├── create_message()              persist bot reply
     └── send_whatsapp_message()       POST wasenderapi.com/api/send-message
                                            │
                                            ▼
                                       WasenderAPI
                                            │
                                            ▼
                                       WhatsApp User receives AI reply
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `403 Forbidden` on POST /webhook | Webhook secret mismatch | Ensure `WASENDER_WEBHOOK_SECRET` in `.env` exactly matches the Webhook Secret in the Wasender dashboard |
| Webhook not received at all | URL not reachable or not HTTPS | Check ngrok / deployment is running and the URL is correct in the dashboard |
| `401 Unauthorized` from WasenderAPI on send | Invalid or expired API key | Regenerate the API key from the session screen and update `WASENDER_API_KEY` |
| `403 Forbidden` from WasenderAPI on send | Session disconnected | Re-scan the QR code in the dashboard to reconnect the session |
| `429 Too Many Requests` | Rate limit hit | Trial plan: 1 msg/min, 50/day. Upgrade to a paid plan or slow down the send rate |
| Bot always returns fallback message | No documents indexed in Pinecone | Upload a document on the Documents page and wait for status = `indexed` |
| Messages received but no reply sent | `WASENDER_API_KEY` missing | Check `.env` and restart the backend |

---

## Security notes

- **Never commit `.env`** — it is already in `.gitignore`.
- The `X-Webhook-Signature` header is verified on every incoming POST using
  HMAC-SHA256.  If `WASENDER_WEBHOOK_SECRET` is empty the check is bypassed
  with a warning — always set it before going live.
- The API key is stored in `.env` (server-side only) — it is never sent to
  the browser.
- Always use HTTPS for the webhook URL.  WasenderAPI rejects plain HTTP
  callback URLs.
- Rate-limit responses (HTTP 429) are logged with the reset window so you can
  back off appropriately.
