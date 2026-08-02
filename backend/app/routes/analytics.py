import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any

from app.routes.auth import get_current_user
from app.database import get_analytics_summary, get_audit_logs, get_all_sessions

logger = logging.getLogger("app.routes.analytics")
router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("", response_model=Dict[str, Any])
def get_dashboard_analytics(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Fetch complete analytics profile for the admin dashboard home view.
    
    Includes aggregate counts, historical graph structures, audit logs, and conversation lists.
    """
    try:
        # Load core counts and date groupings from database module
        summary = get_analytics_summary()
        
        # Load recent sessions list (max 5)
        all_sessions = get_all_sessions()
        recent_sessions = all_sessions[:5]
        
        # Load administrative audit trail
        recent_audit_logs = get_audit_logs(limit=10)
        
        return {
            "summary": {
                "total_documents": summary["total_documents"],
                "total_chunks": summary["total_chunks"],
                "total_users": summary["total_users"],
                "total_conversations": summary["total_conversations"]
            },
            "daily_stats": summary["daily_stats"],
            "recent_chats": recent_sessions,
            "audit_logs": recent_audit_logs
        }
        
    except Exception as e:
        logger.error(f"Failed to gather analytics report: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error synthesizing analytics summaries."
        )
