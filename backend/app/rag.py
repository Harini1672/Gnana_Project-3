"""
Retrieval-Augmented Generation pipeline.

Embeddings:  Google Gemini  (gemini-embedding-001, 3072-dim)
Retrieval:   Pinecone vector search
Generation:  Google Gemini  (gemini-flash-latest)
"""
import logging
import re
from typing import Dict, Any

import google.genai as genai
import google.genai.types as genai_types

from app.config import settings
from app.database import get_system_settings
from app.vector_db import generate_embeddings, query_vector_db

logger = logging.getLogger("app.rag")


# ── Default prompts ───────────────────────────────────────────────────────────

DEFAULT_SYSTEM_PROMPT = (
    "You are a knowledgeable assistant that answers questions based on the "
    "provided document excerpts.\n\n"
    "Rules:\n"
    "1. Read all the context passages carefully before answering.\n"
    "2. Synthesise information from MULTIPLE passages when needed — do not "
    "just quote one passage.\n"
    "3. If the context contains relevant information, give a clear, helpful "
    "answer even if the wording does not exactly match the question.\n"
    "4. Only say you do not know if the context genuinely contains NO "
    "information related to the question.\n"
    "5. Never make up facts that are not supported by the context.\n"
    "6. Keep answers concise but complete."
)

DEFAULT_FALLBACK = (
    "I'm sorry, I couldn't find relevant information in the uploaded documents "
    "to answer that question. Please try rephrasing, or upload additional "
    "documents that cover this topic."
)

# ── Greeting handler ──────────────────────────────────────────────────────────

# Patterns matched against the fully stripped, lower-cased message.
# Anchored with \b so "hello world" does not trigger a greeting reply.
_GREETING_PATTERNS = re.compile(
    r"^("
    r"hi+[!?.\s]*"
    r"|hello[!?.\s]*"
    r"|hey[!?.\s]*"
    r"|howdy[!?.\s]*"
    r"|hiya[!?.\s]*"
    r"|good\s+morning[!?.\s]*"
    r"|good\s+afternoon[!?.\s]*"
    r"|good\s+evening[!?.\s]*"
    r"|good\s+night[!?.\s]*"
    r"|how\s+are\s+you[!?.\s]*"
    r"|how\s+r\s+u[!?.\s]*"
    r"|what'?s\s+up[!?.\s]*"
    r"|sup[!?.\s]*"
    r"|greetings[!?.\s]*"
    r"|namaste[!?.\s]*"
    r")$",
    re.IGNORECASE,
)

GREETING_REPLY = (
    "Hello! 👋 I'm your document assistant. "
    "Ask me any question related to the uploaded documents and "
    "I'll help you find the information."
)


def _is_greeting(text: str) -> bool:
    """Return True when the message is a standalone greeting.

    Only the normalised, stripped text is tested so that punctuation and
    trailing whitespace do not prevent a match.
    """
    normalised = text.strip()
    return bool(_GREETING_PATTERNS.match(normalised))


# ── Gemini generation client ──────────────────────────────────────────────────

def _get_gemini_client() -> genai.Client:
    """Create a google-genai Client for answer generation.

    Key resolution order:
      1. 'gemini_api_key' in Supabase system_settings (editable via Settings UI)
      2. GEMINI_API_KEY environment variable / .env file
    """
    api_key = (
        get_system_settings("gemini_api_key", "") or settings.GEMINI_API_KEY
    )
    if not api_key:
        raise ValueError(
            "GEMINI_API_KEY is not configured. "
            "Add it to backend/.env or set it in System Settings."
        )
    return genai.Client(api_key=api_key)


# ── Public pipeline function ──────────────────────────────────────────────────

def perform_rag(question: str) -> Dict[str, Any]:
    """Execute the full RAG pipeline.

    Step 0 (pre-filter): return a canned greeting reply for standalone
                         salutations — no embedding or Pinecone call made.
    1. Embed the user question with Gemini (gemini-embedding-001).
    2. Similarity-search Pinecone with the configured threshold.
    3. Return the fallback message if no chunks pass the threshold.
    4. Build a structured prompt from the retrieved passages.
    5. Generate the answer with Gemini (gemini-flash-latest).

    Returns:
        {"answer": str, "retrieved_chunks": list[dict]}
    """
    # ── Step 0: greeting short-circuit ───────────────────────────────────────
    if _is_greeting(question):
        logger.info("Greeting detected — returning canned reply (no RAG).")
        return {"answer": GREETING_REPLY, "retrieved_chunks": []}

    try:
        # ── Load RAG parameters ───────────────────────────────────────────────
        top_k          = int(get_system_settings("top_k", 4))
        threshold      = float(get_system_settings("similarity_threshold", 0.20))
        temperature    = float(get_system_settings("llm_temperature", 0.3))
        max_tokens     = int(get_system_settings("llm_max_tokens", 512))
        gemini_model   = (
            get_system_settings("llm_model", "")
            or settings.GEMINI_MODEL
            or "gemini-2.5-flash"
        )
        system_prompt  = get_system_settings("system_prompt", DEFAULT_SYSTEM_PROMPT)
        fallback_msg   = get_system_settings("fallback_message", DEFAULT_FALLBACK)

        # ── 1. Embed question ─────────────────────────────────────────────────
        query_vectors = generate_embeddings([question])
        if not query_vectors:
            raise ValueError("Embedding generation returned an empty result.")
        query_vector = query_vectors[0]

        # ── 2. Retrieve relevant chunks from Pinecone ─────────────────────────
        matches = query_vector_db(query_vector, top_k=top_k, threshold=threshold)

        # ── 3. Fallback when nothing meets the threshold ──────────────────────
        if not matches:
            logger.info(
                "No Pinecone matches above threshold=%.2f for question: %.80s",
                threshold, question,
            )
            return {"answer": fallback_msg, "retrieved_chunks": []}

        # ── 4. Build prompt ───────────────────────────────────────────────────
        context_lines: list[str] = []
        retrieved_chunks: list[dict] = []

        for i, match in enumerate(matches, start=1):
            content = match["content"].strip()
            context_lines.append(f"[Passage {i}]\n{content}")
            retrieved_chunks.append(
                {
                    "vector_id":   match["id"],
                    "score":       match["score"],
                    "content":     content,
                    "document_id": match["metadata"].get("document_id"),
                }
            )

        context_str = "\n\n".join(context_lines)
        user_prompt = (
            f"The following passages are excerpts from the uploaded documents:\n\n"
            f"{context_str}\n\n"
            f"---\n"
            f"Using the passages above, answer the following question as clearly "
            f"and completely as possible.\n\n"
            f"Question: {question}\n\n"
            f"Answer:"
        )

        # ── 5. Generate answer with Gemini ────────────────────────────────────
        client = _get_gemini_client()

        logger.info(
            "Calling Gemini model=%s  top_k=%d  threshold=%.2f  "
            "chunks=%d  temp=%.1f  max_tokens=%d",
            gemini_model, top_k, threshold,
            len(matches), temperature, max_tokens,
        )

        response = client.models.generate_content(
            model=gemini_model,
            contents=user_prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )

        answer = response.text.strip() if response.text else ""

        if not answer:
            logger.warning(
                "Gemini returned an empty response for question: %.60s", question
            )
            answer = fallback_msg

        logger.info(
            "Gemini answered (%d chars) for: %.60s", len(answer), question
        )
        return {"answer": answer, "retrieved_chunks": retrieved_chunks}

    except genai.errors.ClientError as exc:
        logger.error("Gemini ClientError: %s", exc)
        raise ValueError(f"Gemini API error: {exc}") from exc

    except genai.errors.ServerError as exc:
        logger.error("Gemini ServerError (transient): %s", exc)
        raise ValueError(
            f"Gemini service is temporarily unavailable: {exc}"
        ) from exc

    except Exception as exc:
        logger.error("RAG pipeline error: %s", exc, exc_info=True)
        raise
