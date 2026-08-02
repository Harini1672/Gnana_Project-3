import logging
import datetime
from typing import Dict, List, Any, Optional
from supabase import create_client, Client
from app.config import settings

logger = logging.getLogger("app.database")

# Initialize client
supabase: Optional[Client] = None
if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("Supabase credentials missing. Supabase Client not initialized.")

def get_supabase() -> Client:
    if not supabase:
        raise ValueError("Supabase client is not initialized. Please check your environment variables.")
    return supabase

# 1. System Settings Helpers
def get_system_settings(key: str, default: Any = None) -> Any:
    """Retrieve a setting value from the system_settings table."""
    try:
        client = get_supabase()
        res = client.table("system_settings").select("value").eq("key", key).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]["value"]
        return default
    except Exception as e:
        logger.error(f"Error fetching setting '{key}': {e}")
        return default

def get_all_settings() -> Dict[str, Any]:
    """Retrieve all configuration settings."""
    try:
        client = get_supabase()
        res = client.table("system_settings").select("*").execute()
        return {item["key"]: item["value"] for item in res.data}
    except Exception as e:
        logger.error(f"Error fetching all settings: {e}")
        return {}

def update_system_setting(key: str, value: Any) -> bool:
    """Insert or update a setting in system_settings."""
    try:
        client = get_supabase()
        # Using upsert
        client.table("system_settings").upsert({"key": key, "value": value}).execute()
        return True
    except Exception as e:
        logger.error(f"Error updating setting '{key}': {e}")
        return False

# 2. Document Helpers
def create_document(name: str, storage_path: str, file_type: str, size: int) -> Dict[str, Any]:
    """Insert a new document record into the database."""
    try:
        client = get_supabase()
        data = {
            "name": name,
            "storage_path": storage_path,
            "file_type": file_type,
            "size": size,
            "status": "uploaded",
            "chunk_count": 0
        }
        res = client.table("documents").insert(data).execute()
        return res.data[0] if res.data else {}
    except Exception as e:
        logger.error(f"Error creating document: {e}")
        raise e

def update_document_status(doc_id: str, status: str, error_message: Optional[str] = None, chunk_count: Optional[int] = None) -> Dict[str, Any]:
    """Update document extraction/indexing status and error logs."""
    try:
        client = get_supabase()
        update_data = {"status": status}
        if error_message is not None:
            update_data["error_message"] = error_message
        if chunk_count is not None:
            update_data["chunk_count"] = chunk_count
            
        res = client.table("documents").update(update_data).eq("id", doc_id).execute()
        return res.data[0] if res.data else {}
    except Exception as e:
        logger.error(f"Error updating document status: {e}")
        raise e

def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve document by ID."""
    try:
        client = get_supabase()
        res = client.table("documents").select("*").eq("id", doc_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching document {doc_id}: {e}")
        return None

def get_all_documents() -> List[Dict[str, Any]]:
    """Retrieve list of all documents ordered by creation date."""
    try:
        client = get_supabase()
        res = client.table("documents").select("*").order("created_at", desc=True).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching all documents: {e}")
        return []

def delete_document(doc_id: str) -> bool:
    """Delete a document and trigger cascade deletions."""
    try:
        client = get_supabase()
        client.table("documents").delete().eq("id", doc_id).execute()
        return True
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {e}")
        return False

# 3. Document Chunk Helpers
def add_document_chunks(doc_id: str, chunks: List[Dict[str, Any]]) -> bool:
    """Bulk insert document text chunks into the database."""
    if not chunks:
        return True
    try:
        client = get_supabase()
        formatted_chunks = []
        for chunk in chunks:
            formatted_chunks.append({
                "document_id": doc_id,
                "content": chunk["content"],
                "chunk_index": chunk["chunk_index"],
                "vector_id": chunk["vector_id"],
                "metadata": chunk.get("metadata", {})
            })
        client.table("document_chunks").insert(formatted_chunks).execute()
        return True
    except Exception as e:
        logger.error(f"Error inserting chunks for doc {doc_id}: {e}")
        return False

def get_document_chunks(doc_id: str) -> List[Dict[str, Any]]:
    """Retrieve all chunks belonging to a document."""
    try:
        client = get_supabase()
        res = client.table("document_chunks").select("*").eq("document_id", doc_id).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching chunks for doc {doc_id}: {e}")
        return []

# 4. Chat Session & Message Helpers
def create_chat_session(phone_number: str, label: Optional[str] = None) -> Dict[str, Any]:
    """Always create a brand-new chat session row (never deduplicates).

    Used by the dashboard 'New Chat' button to generate an independent conversation.
    The phone_number is expected to be unique on each call (e.g. 'dashboard-<uuid>').
    The optional label is stored in the session_id column as a human-readable name.
    """
    try:
        client = get_supabase()
        session_id_str = label or f"sess_{phone_number.replace('+', '').replace('@', '_').replace('-', '_')}"
        data = {
            "phone_number": phone_number,
            "session_id": session_id_str,
        }
        res = client.table("chat_sessions").insert(data).execute()
        return res.data[0] if res.data else {}
    except Exception as e:
        logger.error(f"Error creating new chat session: {e}")
        raise e

def get_or_create_chat_session(phone_number: str, session_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve an existing chat session by phone number or create a new one."""
    try:
        client = get_supabase()
        # Lookup session
        res = client.table("chat_sessions").select("*").eq("phone_number", phone_number).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        
        # If not exists, create it
        actual_session_id = session_id or f"sess_{phone_number.replace('+', '').replace('@', '_')}"
        data = {
            "phone_number": phone_number,
            "session_id": actual_session_id
        }
        insert_res = client.table("chat_sessions").insert(data).execute()
        return insert_res.data[0] if insert_res.data else {}
    except Exception as e:
        logger.error(f"Error in get_or_create_chat_session: {e}")
        raise e

def create_message(session_id: str, sender: str, content: str, message_id: Optional[str] = None, retrieved_chunks: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Log an incoming user message or AI response in the database."""
    try:
        client = get_supabase()
        data = {
            "session_id": session_id,
            "sender": sender,
            "content": content,
            "message_id": message_id,
            "retrieved_chunks": retrieved_chunks or []
        }
        res = client.table("messages").insert(data).execute()
        
        # Also update the chat session updated_at timestamp
        client.table("chat_sessions").update({"updated_at": datetime.datetime.utcnow().isoformat()}).eq("id", session_id).execute()
        return res.data[0] if res.data else {}
    except Exception as e:
        logger.error(f"Error inserting message: {e}")
        raise e

def get_chat_history(session_id: Optional[str] = None, phone_number: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieve chat history, optionally filtered by session or phone number."""
    try:
        client = get_supabase()
        query = client.table("messages").select("*, chat_sessions(phone_number, session_id)")
        
        if session_id:
            query = query.eq("session_id", session_id)
        elif phone_number:
            # First look up the session
            sess_res = client.table("chat_sessions").select("id").eq("phone_number", phone_number).execute()
            if not sess_res.data:
                return []
            query = query.eq("session_id", sess_res.data[0]["id"])
            
        res = query.order("created_at", desc=False).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error retrieving chat history: {e}")
        return []

def get_all_sessions() -> List[Dict[str, Any]]:
    """Retrieve all chat sessions, with their latest message details."""
    try:
        client = get_supabase()
        # Query sessions
        sessions_res = client.table("chat_sessions").select("*").order("updated_at", desc=True).execute()
        sessions = sessions_res.data or []
        
        # Hydrate with message count and latest message preview
        for sess in sessions:
            msg_res = client.table("messages").select("content, created_at").eq("session_id", sess["id"]).order("created_at", desc=True).limit(1).execute()
            count_res = client.table("messages").select("id", count="exact").eq("session_id", sess["id"]).execute()
            
            sess["last_message"] = msg_res.data[0]["content"] if msg_res.data else None
            sess["last_message_at"] = msg_res.data[0]["created_at"] if msg_res.data else None
            sess["message_count"] = count_res.count if count_res else 0
            
        return sessions
    except Exception as e:
        logger.error(f"Error fetching all sessions: {e}")
        return []

# 5. Audit Log Helpers
def create_audit_log(action: str, details: str, performed_by: Optional[str] = None) -> Dict[str, Any]:
    """Log administration events in the audit trail."""
    try:
        client = get_supabase()
        data = {
            "action": action,
            "details": details,
            "performed_by": performed_by
        }
        res = client.table("audit_logs").insert(data).execute()
        return res.data[0] if res.data else {}
    except Exception as e:
        logger.error(f"Error creating audit log: {e}")
        return {}

def get_audit_logs(limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieve recent administrative audit logs."""
    try:
        client = get_supabase()
        res = client.table("audit_logs").select("*").order("created_at", desc=True).limit(limit).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching audit logs: {e}")
        return []

# 6. Analytics Helpers
def get_analytics_summary() -> Dict[str, Any]:
    """Retrieve aggregated data for dashboard visualizations."""
    try:
        client = get_supabase()
        
        # 1. Total Documents
        docs_res = client.table("documents").select("id", count="exact").execute()
        total_documents = docs_res.count or 0
        
        # 2. Total Indexed Chunks
        chunks_res = client.table("document_chunks").select("id", count="exact").execute()
        total_chunks = chunks_res.count or 0
        
        # 3. Total WhatsApp Users (chat sessions)
        sessions_res = client.table("chat_sessions").select("id", count="exact").execute()
        total_users = sessions_res.count or 0
        
        # 4. Total Conversations / Messages
        msgs_res = client.table("messages").select("id", count="exact").execute()
        total_conversations = msgs_res.count or 0
        
        # 5. Daily message volume (last 7 days)
        # Fetching messages from last 7 days and grouping in memory
        seven_days_ago = (datetime.datetime.utcnow() - datetime.timedelta(days=7)).isoformat()
        
        recent_msgs = client.table("messages").select("created_at").gte("created_at", seven_days_ago).execute()
        
        daily_stats = {}
        for msg in (recent_msgs.data or []):
            date_str = msg["created_at"][:10]  # Get YYYY-MM-DD
            daily_stats[date_str] = daily_stats.get(date_str, 0) + 1
            
        daily_list = [{"date": k, "messages": v} for k, v in sorted(daily_stats.items())]
        
        return {
            "total_documents": total_documents,
            "total_chunks": total_chunks,
            "total_users": total_users,
            "total_conversations": total_conversations,
            "daily_stats": daily_list
        }
    except Exception as e:
        logger.error(f"Error compiling analytics summary: {e}")
        return {
            "total_documents": 0,
            "total_chunks": 0,
            "total_users": 0,
            "total_conversations": 0,
            "daily_stats": []
        }
