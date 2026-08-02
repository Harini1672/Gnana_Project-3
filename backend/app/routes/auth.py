import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Dict, Any

from app.database import get_supabase

logger = logging.getLogger("app.routes.auth")
router = APIRouter(prefix="/auth", tags=["Authentication"])

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict[str, Any]:
    """Dependency injection to authenticate and authorize admin dashboard requests.
    
    Validates JWT token against Supabase auth server.
    """
    token = credentials.credentials
    try:
        supabase_client = get_supabase()
        # Verify the access token directly with Supabase
        user_response = supabase_client.auth.get_user(token)
        
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token or user session expired."
            )
            
        user = user_response.user
        return {
            "id": user.id,
            "email": user.email,
            "role": "admin"
        }
    except Exception as e:
        logger.error(f"JWT Verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )

@router.get("/verify", response_model=Dict[str, Any])
def verify_session(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Verifies that the admin user session is active and valid."""
    return {
        "status": "authenticated",
        "user": current_user
    }
