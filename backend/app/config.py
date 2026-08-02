from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PORT: int = 8000

    # ── Supabase ──────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # ── Google Gemini ─────────────────────────────────────────────────────────
    # Obtain at https://aistudio.google.com/app/apikey
    # Used for BOTH answer generation AND document embeddings.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-flash-latest"
    # Embedding model — gemini-embedding-001 outputs 3072-dim vectors.
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"

    # ── Pinecone ──────────────────────────────────────────────────────────────
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX_NAME: str = "whatsapp-chatbot"

    # ── WasenderAPI ───────────────────────────────────────────────────────────
    # Dashboard: https://app.wasenderapi.com
    WASENDER_API_KEY: str = ""
    # Human-readable session name (e.g. "Gowthami") — used for display only.
    WASENDER_SESSION_NAME: str = "Gowthami"
    # Base URL — do not change unless using a self-hosted instance.
    WASENDER_BASE_URL: str = "https://www.wasenderapi.com"
    # Webhook secret — must match the value in the Wasender dashboard
    # (Session → Webhooks → Webhook Secret).
    WASENDER_WEBHOOK_SECRET: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
