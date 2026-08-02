import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

from app.routes.auth import get_current_user
from app.database import get_all_settings, update_system_setting, create_audit_log
from app.config import settings as app_settings

logger = logging.getLogger("app.routes.settings")
router = APIRouter(prefix="/settings", tags=["Settings"])


# ── Request schema ────────────────────────────────────────────────────────────

class SettingsUpdateSchema(BaseModel):
    # RAG retrieval
    chunk_size:           Optional[int]   = Field(None, ge=100, le=5000)
    chunk_overlap:        Optional[int]   = Field(None, ge=0)
    top_k:                Optional[int]   = Field(None, ge=1, le=20)
    similarity_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)
    system_prompt:        Optional[str]   = None
    fallback_message:     Optional[str]   = None

    # LLM generation
    llm_model:       Optional[str]   = None
    llm_temperature: Optional[float] = Field(None, ge=0.0, le=2.0)
    llm_max_tokens:  Optional[int]   = Field(None, ge=64, le=4096)

    # Google Gemini (generation + embeddings)
    gemini_api_key:        Optional[str] = None
    gemini_embedding_model: Optional[str] = None

    # Pinecone
    pinecone_api_key:   Optional[str] = None
    pinecone_index_name: Optional[str] = None

    # WasenderAPI
    wasender_api_key:      Optional[str] = None
    wasender_session_name: Optional[str] = None
    wasender_base_url:     Optional[str] = None
    wasender_webhook_secret: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def mask_sensitive_value(value: str) -> str:
    """Return a masked representation: show first 4 + last 4 chars."""
    if not value:
        return ""
    if len(value) <= 8:
        return "********"
    return f"{value[:4]}...{value[-4:]}"


def _is_masked(value: Optional[str]) -> bool:
    """Return True if the value looks like a masked placeholder sent back from the UI."""
    if not value:
        return False
    return value.startswith("****") or "..." in value


# ── GET /settings ─────────────────────────────────────────────────────────────

@router.get("", response_model=Dict[str, Any])
def get_settings(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Return system configuration with sensitive credentials masked."""
    try:
        raw = get_all_settings()

        from app.rag import DEFAULT_SYSTEM_PROMPT, DEFAULT_FALLBACK

        gemini_key = raw.get("gemini_api_key", app_settings.GEMINI_API_KEY)

        return {
            # ── RAG retrieval ──────────────────────────────────────────────
            "chunk_size":           int(raw.get("chunk_size", 500)),
            "chunk_overlap":        int(raw.get("chunk_overlap", 50)),
            "top_k":                int(raw.get("top_k", 4)),
            "similarity_threshold": float(raw.get("similarity_threshold", 0.20)),
            "system_prompt":        raw.get("system_prompt", DEFAULT_SYSTEM_PROMPT),
            "fallback_message":     raw.get("fallback_message", DEFAULT_FALLBACK),

            # ── LLM ────────────────────────────────────────────────────────
            "llm_model":       raw.get("llm_model", app_settings.GEMINI_MODEL or "gemini-2.5-flash"),
            "llm_temperature": float(raw.get("llm_temperature", 0.3)),
            "llm_max_tokens":  int(raw.get("llm_max_tokens", 512)),

            # ── Google Gemini ──────────────────────────────────────────────
            "gemini_api_key":        mask_sensitive_value(gemini_key),
            "gemini_embedding_model": raw.get(
                "gemini_embedding_model",
                app_settings.GEMINI_EMBEDDING_MODEL or "gemini-embedding-001",
            ),

            # ── Pinecone ───────────────────────────────────────────────────
            "pinecone_api_key":    mask_sensitive_value(raw.get("pinecone_api_key", "")),
            "pinecone_index_name": raw.get("pinecone_index_name", app_settings.PINECONE_INDEX_NAME),
            "embedding_dimension": int(raw.get("embedding_dimension", 3072)),

            # ── WasenderAPI ────────────────────────────────────────────────
            "wasender_api_key": mask_sensitive_value(
                raw.get("wasender_api_key", app_settings.WASENDER_API_KEY)
            ),
            "wasender_session_name": raw.get(
                "wasender_session_name", app_settings.WASENDER_SESSION_NAME
            ),
            "wasender_base_url": raw.get(
                "wasender_base_url", app_settings.WASENDER_BASE_URL
            ),
            "wasender_webhook_secret": mask_sensitive_value(
                raw.get("wasender_webhook_secret", app_settings.WASENDER_WEBHOOK_SECRET)
            ),
        }
    except Exception as exc:
        logger.error("Failed to fetch settings: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve system configuration.",
        )


# ── POST /settings ────────────────────────────────────────────────────────────

@router.post("", response_model=Dict[str, Any])
def update_settings(
    payload: SettingsUpdateSchema,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Persist updated configuration values to Supabase system_settings.

    Masked values (containing '...') are never written back so they cannot
    accidentally overwrite a real key with a placeholder.
    """
    try:
        updated_keys: list[str] = []

        for key, value in payload.model_dump(exclude_unset=True).items():
            # Skip masked/placeholder values sent back by the UI
            if _is_masked(value):
                continue
            if value is not None:
                update_system_setting(key, value)
                updated_keys.append(key)

        if updated_keys:
            details = f"Updated system configuration keys: {', '.join(updated_keys)}"
            create_audit_log("update_settings", details, current_user["id"])
            logger.info(details)

        return {"status": "success", "updated_keys": updated_keys}

    except Exception as exc:
        logger.error("Failed to update settings: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not update system settings: {exc}",
        )
