import logging
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any

from app.config import settings
from app.routes import auth, documents, chat, webhook, analytics, settings as settings_route
from app.database import get_supabase
from app.vector_db import get_pinecone_client

# Configure standard formatting for logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup verification and logging
    logger.info("Initializing system dependencies and validating connections...")
    
    # Check Supabase Database
    try:
        supabase_client = get_supabase()
        supabase_client.table("system_settings").select("key").limit(1).execute()
        logger.info("Startup validation: Supabase database connection verified successfully.")
    except Exception as e:
        logger.critical(f"Startup validation failure: Supabase database connection failed: {e}", exc_info=True)
        
    # Check Pinecone Vector Store
    try:
        pc_client = get_pinecone_client()
        pc_client.list_indexes()
        logger.info("Startup validation: Pinecone vector store connection verified successfully.")
    except Exception as e:
        logger.critical(f"Startup validation failure: Pinecone vector store connection failed: {e}", exc_info=True)
        
    yield
    
    logger.info("Shutting down application...")

app = FastAPI(
    title="AI-Powered WhatsApp Chatbot RAG Backend",
    description="Scalable FastAPI service processing text extractions, Pinecone indexing, and WhatsApp completions.",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend integration (localhost in dev, Vercel in production)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root Endpoint Redirect to Documentation
@app.get("/", include_in_schema=False)
def index() -> RedirectResponse:
    """Redirect to Swagger API documentation."""
    return RedirectResponse(url="/docs")

# Health Check Endpoint
@app.get("/health", tags=["Health"])
def health_check() -> Dict[str, Any]:
    """Validate system status and connection state with database/vector integrations."""
    status_report = {
        "status": "healthy",
        "database": "disconnected",
        "vector_store": "disconnected"
    }
    
    # Check Supabase
    try:
        supabase_client = get_supabase()
        supabase_client.table("system_settings").select("key").limit(1).execute()
        status_report["database"] = "connected"
    except Exception as e:
        status_report["status"] = "degraded"
        status_report["database_error"] = str(e)
        logger.error(f"Health Check: Database connection failed: {e}")
        
    # Check Pinecone
    try:
        pc_client = get_pinecone_client()
        pc_client.list_indexes()
        status_report["vector_store"] = "connected"
    except Exception as e:
        status_report["status"] = "degraded"
        status_report["vector_store_error"] = str(e)
        logger.error(f"Health Check: Pinecone connection failed: {e}")
        
    return status_report

# Register API Routers
# Note: /webhook does not require Bearer Auth — it uses X-Webhook-Signature
# verification from WasenderAPI instead.
# All other routes (auth, documents, analytics, chat, settings) are Bearer-protected.

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(documents.router)
api_router.include_router(chat.router)
api_router.include_router(webhook.router)
api_router.include_router(analytics.router)
api_router.include_router(settings_route.router)

# Mount all endpoints under root (matching specifications: /webhook, /upload-document, /health etc.)
app.include_router(api_router)

if __name__ == "__main__":
    try:
        # Start webserver
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=settings.PORT,
            reload=True
        )
    except Exception as startup_err:
        logger.critical(f"FastAPI application failed to start: {startup_err}", exc_info=True)
        raise
