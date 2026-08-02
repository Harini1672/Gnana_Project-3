"""
WasenderAPI integration.

Two public functions:
  verify_webhook_signature(raw_payload, signature_header)
      Verifies the X-Webhook-Signature header sent by Wasender on every POST.

  send_whatsapp_message(to_phone, text)
      Sends a plain-text message via the WasenderAPI REST endpoint.

WasenderAPI docs: https://wasenderapi.com/api-docs
"""

import hmac
import hashlib
import logging
from typing import Optional

import httpx

from app.config import settings
from app.database import get_system_settings

logger = logging.getLogger("app.whatsapp")

# ── Signature verification ────────────────────────────────────────────────────

def verify_webhook_signature(raw_payload: bytes, signature_header: Optional[str]) -> bool:
    """Verify the X-Webhook-Signature header sent by Wasender with every webhook POST.

    IMPORTANT — WasenderAPI does NOT send an HMAC digest.
    It sends the plain webhook secret verbatim in the X-Webhook-Signature header.
    Verification is therefore a constant-time string equality check against the
    configured WASENDER_WEBHOOK_SECRET.

    Args:
        raw_payload:       The raw request body bytes (kept for API compatibility).
        signature_header:  Value of the X-Webhook-Signature request header.

    Returns:
        True  — secret matches.
        True  — webhook secret is not configured (bypass with warning; dev only).
        False — signature header is missing or does not match the configured secret.
    """
    webhook_secret = (
        settings.WASENDER_WEBHOOK_SECRET
        or get_system_settings("wasender_webhook_secret", "")
    )

    if not webhook_secret:
        logger.warning(
            "WASENDER_WEBHOOK_SECRET is not configured. "
            "Webhook verification is BYPASSED. "
            "Set WASENDER_WEBHOOK_SECRET in .env before going to production."
        )
        return True

    if not signature_header:
        logger.error(
            "X-Webhook-Signature header is missing from the Wasender webhook request."
        )
        return False

    # WasenderAPI sends the plain secret as the signature value — compare directly.
    # Use hmac.compare_digest to prevent timing attacks.
    valid = hmac.compare_digest(
        webhook_secret.strip(),
        signature_header.strip(),
    )
    if not valid:
        logger.error(
            "Wasender webhook secret mismatch — possible spoofed request. "
            "Received: %.8s...  Expected: %.8s...",
            signature_header.strip(), webhook_secret.strip(),
        )
    return valid


# ── Send message ──────────────────────────────────────────────────────────────

def send_whatsapp_message(to_phone: str, text: str) -> bool:
    """Send a plain-text WhatsApp message via WasenderAPI.

    Endpoint:
        POST {WASENDER_BASE_URL}/api/send-message

    Auth:
        Authorization: Bearer {WASENDER_API_KEY}

    Args:
        to_phone:  Recipient phone number.  E.164 format is preferred
                   (e.g. "+919876543210").  A bare number without "+" is also
                   accepted — the "+" is prepended automatically if absent.
        text:      Plain-text message body.

    Returns:
        True on success (HTTP 2xx + {"status": true}), False on any error.
    """
    api_key = (
        settings.WASENDER_API_KEY
        or get_system_settings("wasender_api_key", "")
    )
    base_url = (
        settings.WASENDER_BASE_URL
        or get_system_settings("wasender_base_url", "https://www.wasenderapi.com")
    ).rstrip("/")

    if not api_key:
        logger.error(
            "Cannot send WhatsApp message: WASENDER_API_KEY is not configured."
        )
        return False

    # Ensure E.164 format — Wasender requires the leading "+"
    recipient = to_phone if to_phone.startswith("+") else f"+{to_phone}"

    url = f"{base_url}/api/send-message"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "to": recipient,
        "text": text,
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            logger.info(
                "Sending WhatsApp message to %s via WasenderAPI...", recipient
            )
            response = client.post(url, json=payload, headers=headers)

            # ── Rate-limit handling ───────────────────────────────────────────
            if response.status_code == 429:
                retry_after = response.headers.get("X-RateLimit-Reset", "unknown")
                logger.error(
                    "WasenderAPI rate limit hit sending to %s. "
                    "Rate window resets in %s seconds.",
                    recipient, retry_after,
                )
                return False

            # ── Auth / key errors ─────────────────────────────────────────────
            if response.status_code == 401:
                logger.error(
                    "WasenderAPI returned 401 Unauthorized for recipient %s. "
                    "Check that WASENDER_API_KEY is correct and the session is active.",
                    recipient,
                )
                return False

            if response.status_code == 403:
                logger.error(
                    "WasenderAPI returned 403 Forbidden for recipient %s. "
                    "The API key may lack permission or the session is disconnected.",
                    recipient,
                )
                return False

            # ── General 4xx / 5xx ─────────────────────────────────────────────
            if response.status_code >= 400:
                logger.error(
                    "WasenderAPI error %d sending to %s: %s",
                    response.status_code, recipient, response.text,
                )
                return False

            # ── Check application-level success field ─────────────────────────
            # WasenderAPI returns {"success": true/false, ...} not {"status": ...}
            try:
                body = response.json()
            except Exception:
                body = {}

            # Accept both "success" (current API) and "status" (fallback)
            api_ok = body.get("success", body.get("status", True))
            if not api_ok:
                logger.error(
                    "WasenderAPI reported failure for recipient %s: %s",
                    recipient, body.get("message", "(no detail)"),
                )
                return False

            logger.info(
                "WhatsApp message delivered successfully to %s. Response: %s",
                recipient, response.text,
            )
            return True

    except httpx.TimeoutException as exc:
        logger.error(
            "WasenderAPI request timed out sending to %s: %s", recipient, exc
        )
        return False
    except httpx.RequestError as exc:
        logger.error(
            "Network error sending WhatsApp message to %s: %s", recipient, exc
        )
        return False
    except Exception as exc:
        logger.error(
            "Unexpected error sending WhatsApp message to %s: %s", recipient, exc
        )
        return False
