"""
Vector database helpers.

Embeddings:  Google Gemini  (gemini-embedding-001, 3072-dim)
Vector store: Pinecone
"""

import logging
from typing import List, Dict, Any, Optional

import google.genai as genai
from pinecone import Pinecone, ServerlessSpec

from app.config import settings
from app.database import get_system_settings

logger = logging.getLogger("app.vector_db")

# Gemini embedding model outputs 3072-dimensional vectors.
GEMINI_EMBEDDING_DIM = 3072

# Pinecone client is created lazily once.
_pinecone_client: Optional[Pinecone] = None


# ── Gemini embedding client ───────────────────────────────────────────────────

def _get_gemini_client() -> genai.Client:
    """Return a google-genai Client using the configured API key.

    Key resolution order:
      1. 'gemini_api_key' in Supabase system_settings (editable via Settings UI)
      2. GEMINI_API_KEY environment variable / .env file
    """
    api_key = (
        get_system_settings("gemini_api_key", "")
        or settings.GEMINI_API_KEY
    )
    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY is not configured. "
            "Add it to backend/.env or set it in System Settings."
        )
    return genai.Client(api_key=api_key)


def _get_embedding_model() -> str:
    """Return the active Gemini embedding model name."""
    return (
        get_system_settings("gemini_embedding_model", "")
        or settings.GEMINI_EMBEDDING_MODEL
        or "gemini-embedding-001"
    )


# ── Pinecone helpers ──────────────────────────────────────────────────────────

def get_pinecone_client() -> Pinecone:
    global _pinecone_client
    if not _pinecone_client:
        api_key = (
            settings.PINECONE_API_KEY
            or get_system_settings("pinecone_api_key", "")
        )
        if not api_key:
            raise ValueError(
                "Pinecone API key is missing. "
                "Configure PINECONE_API_KEY in .env or System Settings."
            )
        _pinecone_client = Pinecone(api_key=api_key)
    return _pinecone_client


def get_pinecone_index():
    """Return the Pinecone index, creating it at GEMINI_EMBEDDING_DIM if absent."""
    pc = get_pinecone_client()
    index_name = (
        settings.PINECONE_INDEX_NAME
        or get_system_settings("pinecone_index_name", "whatsapp-chatbot")
    )

    existing = [idx.name for idx in pc.list_indexes()]
    if index_name not in existing:
        logger.info(
            "Pinecone index '%s' not found — creating serverless index "
            "with dimension=%d (gemini-embedding-001).",
            index_name, GEMINI_EMBEDDING_DIM,
        )
        pc.create_index(
            name=index_name,
            dimension=GEMINI_EMBEDDING_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud="aws", region="us-east-1"),
        )
        logger.info("Pinecone index '%s' created.", index_name)

    return pc.Index(index_name)


# ── Embeddings ────────────────────────────────────────────────────────────────

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Embed a list of strings using the Gemini embedding API.

    Args:
        texts: List of strings to embed.

    Returns:
        List of float vectors, one per input string.
    """
    model = _get_embedding_model()
    client = _get_gemini_client()

    logger.info(
        "Generating Gemini embeddings — model=%s  count=%d", model, len(texts)
    )

    # embed_content accepts a list of strings directly.
    response = client.models.embed_content(
        model=model,
        contents=texts,
    )

    vectors = [list(emb.values) for emb in response.embeddings]

    if len(vectors) != len(texts):
        raise ValueError(
            f"Gemini returned {len(vectors)} embeddings for {len(texts)} inputs."
        )

    logger.info(
        "Gemini embeddings generated — dim=%d  count=%d",
        len(vectors[0]) if vectors else 0,
        len(vectors),
    )
    return vectors


# ── Upsert / delete / query ───────────────────────────────────────────────────

def upsert_vectors(
    vectors: List[Dict[str, Any]], namespace: str = "documents"
) -> bool:
    """Upsert vectors into the Pinecone index in batches of 100."""
    index = get_pinecone_index()
    records = [(v["id"], v["values"], v["metadata"]) for v in vectors]

    batch_size = 100
    for i in range(0, len(records), batch_size):
        index.upsert(vectors=records[i : i + batch_size], namespace=namespace)

    logger.info("Upserted %d vectors to Pinecone.", len(vectors))
    return True


def delete_vectors_by_document(
    doc_id: str, namespace: str = "documents"
) -> bool:
    """Delete all Pinecone vectors for a given document ID."""
    try:
        index = get_pinecone_index()
        index.delete(
            filter={"document_id": {"$eq": doc_id}}, namespace=namespace
        )
        logger.info("Deleted Pinecone vectors for document %s.", doc_id)
        return True
    except Exception as exc:
        logger.error("Error deleting vectors for document %s: %s", doc_id, exc)
        return False


def query_vector_db(
    query_vector: List[float],
    top_k: int = 4,
    threshold: float = 0.20,
    namespace: str = "documents",
) -> List[Dict[str, Any]]:
    """Query Pinecone and return chunks that score above the threshold."""
    try:
        index = get_pinecone_index()
        logger.info("Querying Pinecone index with top_k=%d", top_k)
        res = index.query(
            namespace=namespace,
            vector=query_vector,
            top_k=top_k,
            include_metadata=True,
        )

        raw_matches = (
            res.matches if hasattr(res, "matches") else res.get("matches", [])
        )
        matches = []
        for match in raw_matches or []:
            score = (
                match.score
                if hasattr(match, "score")
                else match.get("score", 0.0)
            )
            if score >= threshold:
                metadata = (
                    match.metadata
                    if hasattr(match, "metadata")
                    else match.get("metadata", {})
                ) or {}
                vec_id = (
                    match.id if hasattr(match, "id") else match.get("id")
                )
                matches.append(
                    {
                        "id": vec_id,
                        "score": score,
                        "metadata": metadata,
                        "content": metadata.get("content", ""),
                    }
                )
        return matches
    except Exception as exc:
        logger.error("Error querying Pinecone: %s", exc)
        return []
