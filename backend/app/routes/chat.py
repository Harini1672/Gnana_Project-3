import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.routes.auth import get_current_user
from app.database import (
    create_chat_session,
    get_or_create_chat_session,
    create_message,
    get_chat_history,
    get_all_sessions,
)
from app.rag import perform_rag

logger = logging.getLogger("app.routes.chat")
router = APIRouter(tags=["Chat"])


class ChatMessageRequestSchema(BaseModel):
    message: str
    phone_number: Optional[str] = "admin-test-user"


class CreateSessionRequestSchema(BaseModel):
    label: Optional[str] = None  # Optional human-readable name shown as session title


@router.post("/sessions", response_model=Dict[str, Any], status_code=201)
def create_new_session(
    payload: CreateSessionRequestSchema,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Create a brand-new independent chat session for the admin dashboard.

    Generates a unique phone_number (dashboard-<uuid8>) so the session is
    never merged with an existing one by get_or_create_chat_session.
    Returns the full session row including its UUID 'id'.
    """
    try:
        # Unique phone number — 8-char hex suffix makes collisions astronomically unlikely
        unique_suffix = uuid.uuid4().hex[:8]
        phone_number = f"dashboard-{unique_suffix}"
        label = payload.label or f"Chat {unique_suffix}"
        session = create_chat_session(phone_number, label=label)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Session creation returned empty result.",
            )
        return session
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating new session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not create session: {str(e)}",
        )

@router.post("/chat", response_model=Dict[str, Any])
def test_chat_interaction(
    payload: ChatMessageRequestSchema,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Directly test the chatbot RAG search and generation from the admin interface.
    
    Logs queries inside the test session and returns context references.
    """
    try:
        phone_number = payload.phone_number
        message_text = payload.message.strip()
        
        if not message_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Message content cannot be empty."
            )
            
        # 1. Fetch/Create Session for direct dashboard testing
        session = get_or_create_chat_session(phone_number)
        session_id = session["id"]
        
        # 2. Log User message
        create_message(session_id, "user", message_text, message_id=None)
        
        # 3. Perform RAG pipeline
        rag_res = perform_rag(message_text)
        answer = rag_res["answer"]
        retrieved_chunks = rag_res["retrieved_chunks"]
        
        # 4. Log Bot response
        create_message(session_id, "bot", answer, retrieved_chunks=retrieved_chunks)
        
        return {
            "session_id": session_id,
            "answer": answer,
            "retrieved_chunks": retrieved_chunks
        }
    except Exception as e:
        logger.error(f"Error in direct dashboard test chat: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat generation failed: {str(e)}"
        )

@router.get("/chat-history", response_model=List[Dict[str, Any]])
def get_all_active_sessions(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch list of all active chat sessions, including latest message previews and message counts."""
    return get_all_sessions()

@router.get("/chat-history/{session_id}/messages", response_model=List[Dict[str, Any]])
def get_session_messages(session_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieve full chronological conversation log for a specific chat session."""
    try:
        messages = get_chat_history(session_id=session_id)
        return messages
    except Exception as e:
        logger.error(f"Error retrieving message list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not retrieve chat session logs: {str(e)}"
        )
