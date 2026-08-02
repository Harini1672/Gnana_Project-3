"""
WasenderAPI webhook handler.

POST /webhook  — Receives real-time events from WasenderAPI (incoming WhatsApp
                 messages) and feeds them through the RAG pipeline before
                 replying to the sender.

WasenderAPI webhook docs: https://wasenderapi.com/api-docs/webhooks/webhook-setup

Expected event type handled here: "messages.received"

Payload structure (messages.received):
{
  "event": "messages.received",
  "timestamp": 1633456789,
  "data": {
    "messages": {
      "key": {
        "id": "3EB0X123456789",
        "fromMe": false,
        "remoteJid": "1234567890@s.whatsapp.net",
        "addressingMode": "pn",
        "senderPn": "+1234567890@s.whatsapp.net",
        "cleanedSenderPn": "1234567890",
        "senderLid": "555555555@lid"
      },
      "messageBody": "Hello, I have a question",
      "message": {
        "conversation": "Hello, I have a question"
      }
    }
  }
}
"""

import json
import logging
from typing import Any, Dict, Optional
from functools import lru_cache
import time

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request, status

from app.database import (
    create_audit_log,
    create_message,
    get_or_create_chat_session,
    get_system_settings,
)
from app.rag import perform_rag
from app.whatsapp import send_whatsapp_message, verify_webhook_signature

logger = logging.getLogger("app.routes.webhook")
router = APIRouter(tags=["Webhook"])

# ── Deduplication cache ────────────────────────────────────────────────────────
# Wasender fires BOTH "messages.received" AND "messages-personal.received" for
# every single incoming WhatsApp message (two identical POSTs, same message ID).
# Without deduplication the RAG pipeline runs twice, the second send hits the
# 429 rate limit on trial plans (1 msg/min), and the user never gets the reply.
#
# Simple in-memory set: store (message_id, expires_at).
# TTL = 120 seconds — enough to suppress the duplicate, short enough not to
# block a user legitimately resending the same text minutes later.
_seen_message_ids: dict[str, float] = {}
_DEDUP_TTL_SECONDS = 120

def _is_duplicate(message_id: str) -> bool:
    """Return True if this message_id was already processed within the TTL window."""
    now = time.monotonic()
    # Evict expired entries first (keep memory bounded)
    expired = [k for k, exp in _seen_message_ids.items() if now > exp]
    for k in expired:
        del _seen_message_ids[k]
    if message_id in _seen_message_ids:
        return True
    _seen_message_ids[message_id] = now + _DEDUP_TTL_SECONDS
    return False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_message(payload: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Extract the sender phone number, message text, and message ID from a
    Wasender 'messages.received' webhook payload.

    Returns a dict with keys  phone_number, message_text, message_id
    or None if the payload contains no actionable incoming text message.

    Only 'messages.received' events with a non-empty messageBody are processed.
    Status updates, group messages, and outgoing messages are all ignored.
    """
    try:
        event = payload.get("event", "")

        # Only handle incoming personal messages
        # Wasender sends both "messages.received" and "messages-personal.received"
        if event not in (
            "messages.received",
            "messages.personal.received",
            "messages-personal.received",
        ):
            logger.info("Wasender event '%s' is not an incoming message — skipping.", event)
            return None

        data = payload.get("data", {})
        msg = data.get("messages", {})

        if not msg:
            logger.debug("Wasender payload has no 'messages' key under 'data'.")
            return None

        key = msg.get("key", {})

        # Skip messages sent by this session (echoes)
        if key.get("fromMe", False):
            logger.debug("Skipping outgoing message echo (fromMe=true).")
            return None

        message_body = msg.get("messageBody", "").strip()

        # Fall back to conversation field if messageBody is empty
        if not message_body:
            message_body = (
                msg.get("message", {}).get("conversation", "").strip()
            )

        if not message_body:
            logger.info(
                "Ignoring non-text or empty Wasender message (event=%s).", event
            )
            return None

        # cleanedSenderPn is the bare phone number without "+" or "@..." suffix
        phone_number = key.get("cleanedSenderPn", "").strip()
        if not phone_number:
            # Fallback: strip domain suffix from remoteJid  e.g. "1234567890@s.whatsapp.net"
            remote_jid = key.get("remoteJid", "")
            phone_number = remote_jid.split("@")[0].strip()

        message_id = key.get("id", "").strip()

        if not phone_number:
            logger.error(
                "Could not extract sender phone number from Wasender payload."
            )
            return None

        return {
            "phone_number": phone_number,
            "message_text": message_body,
            "message_id": message_id,
        }

    except Exception as exc:
        logger.error("Error parsing Wasender webhook payload: %s", exc)
    return None


# ── Background RAG pipeline ───────────────────────────────────────────────────

def _process_incoming_message(
    phone_number: str, message_text: str, message_id: str
) -> None:
    """Full RAG pipeline executed in a background task.

    1. Get or create a Supabase chat session for the sender.
    2. Persist the user message.
    3. Run the RAG pipeline (Pinecone retrieval → Google Gemini generation).
    4. Persist the bot response.
    5. Send the answer back via WasenderAPI.
    """
    try:
        logger.info(
            "Processing WhatsApp message from %s: '%s'",
            phone_number, message_text[:60],
        )

        # 1. Session
        session = get_or_create_chat_session(phone_number)
        session_id = session["id"]

        # 2. Persist user message
        create_message(
            session_id=session_id,
            sender="user",
            content=message_text,
            message_id=message_id or None,
        )

        # 3. RAG  (Pinecone retrieval → Google Gemini generation)
        rag_result = perform_rag(message_text)
        answer = rag_result["answer"]
        retrieved = rag_result["retrieved_chunks"]

        # 4. Persist bot response
        create_message(
            session_id=session_id,
            sender="bot",
            content=answer,
            retrieved_chunks=retrieved,
        )

        # 5. Reply on WhatsApp via WasenderAPI
        sent = send_whatsapp_message(phone_number, answer)
        if not sent:
            logger.error(
                "Failed to deliver WhatsApp reply to %s via WasenderAPI.",
                phone_number,
            )
        else:
            logger.info(
                "RAG reply delivered to %s (%d chars).", phone_number, len(answer)
            )

        create_audit_log(
            "whatsapp_message",
            (
                f"Processed message from {phone_number}: "
                f"'{message_text[:50]}' → replied {len(answer)} chars"
            ),
        )

    except Exception as exc:
        logger.error(
            "Error in RAG background pipeline for %s: %s",
            phone_number, exc, exc_info=True,
        )


# ── GET /webhook — health probe ───────────────────────────────────────────────

@router.get("/webhook", status_code=status.HTTP_200_OK)
async def webhook_probe():
    """Simple health probe so you can confirm the webhook URL is reachable.

    Hit this endpoint in a browser or with curl to verify ngrok / your domain
    is forwarding traffic to the backend correctly before registering the URL
    in the WasenderAPI dashboard.

    Example:
        curl https://gift-equivocal-refurbish.ngrok-free.dev/webhook
        → {"status": "ok", "message": "WasenderAPI webhook endpoint is live"}
    """
    return {
        "status": "ok",
        "message": "WasenderAPI webhook endpoint is live",
        "instructions": (
            "Register POST https://<your-domain>/webhook in the "
            "WasenderAPI dashboard under Session → Webhooks."
        ),
    }


# ── POST /webhook — Incoming Wasender events ──────────────────────────────────

@router.post("/webhook", status_code=status.HTTP_200_OK)
async def webhook_receive(
    request: Request,
    background_tasks: BackgroundTasks,
    x_webhook_signature: Optional[str] = Header(
        None, alias="X-Webhook-Signature"
    ),
):
    """Receive and process incoming WhatsApp message events from WasenderAPI.

    Security:
        Every POST from Wasender includes an optional X-Webhook-Signature
        header (HMAC-SHA256 of the raw body, keyed with your Webhook Secret).
        Verification is enforced when WASENDER_WEBHOOK_SECRET is set.

    Processing:
        Parsing and RAG generation run in a background task so this endpoint
        returns HTTP 200 immediately — Wasender expects a fast 2xx response.

    Handled events:
        messages.received           — incoming personal message
        messages.personal.received  — alternate event name for personal chats

    Ignored events:
        All other event types (status updates, group events, outgoing echoes,
        session status changes, etc.) are acknowledged but not processed.
    """
    raw_body = await request.body()

    # ── Log every incoming event immediately ──────────────────────────────────
    event_hint = "(unparsed)"
    try:
        event_hint = json.loads(raw_body).get("event", "unknown")
    except Exception:
        pass
    logger.info(
        "Wasender webhook POST received — event=%s  bytes=%d",
        event_hint, len(raw_body),
    )

    # ── Signature verification ────────────────────────────────────────────────
    # WasenderAPI sends the plain secret in X-Webhook-Signature (not an HMAC digest).
    if not verify_webhook_signature(raw_body, x_webhook_signature):
        logger.warning(
            "Rejected Wasender webhook POST: X-Webhook-Signature does not match "
            "WASENDER_WEBHOOK_SECRET. Check that the secret in .env matches exactly "
            "what is set in WasenderAPI dashboard → Session → Webhooks → Webhook Secret."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid webhook signature.",
        )

    # ── Parse JSON payload ────────────────────────────────────────────────────
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        logger.error("Could not parse Wasender webhook JSON body: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload.",
        )

    # ── Extract actionable message ────────────────────────────────────────────
    msg = _extract_message(payload)
    if msg is None:
        # Non-message events (delivery receipts, group updates, etc.) — ack only
        logger.info(
            "Wasender event '%s' acknowledged (not an incoming text message — skipped).",
            payload.get("event", "unknown"),
        )
        return {"status": "ok"}

    # ── Deduplication — Wasender fires two events per message ─────────────────
    # Both "messages.received" and "messages-personal.received" arrive for the
    # same message within milliseconds. Process only the first one.
    if _is_duplicate(msg["message_id"]):
        logger.info(
            "Duplicate message_id %s already processed — skipping second event.",
            msg["message_id"],
        )
        return {"status": "ok"}

    # ── Dispatch to background RAG pipeline ───────────────────────────────────
    background_tasks.add_task(
        _process_incoming_message,
        msg["phone_number"],
        msg["message_text"],
        msg["message_id"],
    )

    # Return 200 immediately so Wasender does not retry
    return {"status": "received"}
