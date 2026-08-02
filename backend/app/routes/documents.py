import logging
import uuid
import time
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.routes.auth import get_current_user
from app.database import (
    create_document,
    update_document_status,
    get_all_documents,
    get_document,
    delete_document,
    add_document_chunks,
    create_audit_log,
    get_supabase,
    get_system_settings,
)
from app.utils.text_extractor import extract_text
from app.utils.chunker import chunk_text
from app.vector_db import generate_embeddings, upsert_vectors, delete_vectors_by_document

logger = logging.getLogger("app.routes.documents")
router = APIRouter(tags=["Documents"])

# Free-tier Gemini embedding limit: 100 requests/minute.
# Using batch_size=20 keeps each batch well inside the limit even when multiple
# documents are uploaded at the same time.
_EMBED_BATCH_SIZE  = 20
_EMBED_RETRY_MAX   = 5       # retry attempts on 429
_EMBED_RETRY_DELAY = 15      # seconds to wait on first 429 (multiplied per attempt)
_EMBED_BATCH_PAUSE = 1.5     # seconds between successful batches


class ReindexRequestSchema(BaseModel):
    document_id: str


def _embed_with_retry(batch: List[str]) -> List[List[float]]:
    """Call generate_embeddings with exponential backoff on 429 rate-limit errors."""
    for attempt in range(1, _EMBED_RETRY_MAX + 1):
        try:
            return generate_embeddings(batch)
        except Exception as exc:
            msg = str(exc)
            if ("429" in msg or "RESOURCE_EXHAUSTED" in msg) and attempt < _EMBED_RETRY_MAX:
                wait = _EMBED_RETRY_DELAY * attempt
                logger.warning(
                    "Gemini embedding rate limit hit (attempt %d/%d) — waiting %ds.",
                    attempt, _EMBED_RETRY_MAX, wait,
                )
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("Embedding failed after max retries.")  # unreachable

def process_and_index_document(doc_id: str, file_bytes: bytes, file_name: str):
    """Background task: extract → chunk → embed (with retry) → Pinecone → DB."""
    try:
        logger.info("Processing started: %s (%s)", file_name, doc_id)
        update_document_status(doc_id, "processing")

        # 1. Extract text ─────────────────────────────────────────────────────
        extracted_text = extract_text(file_bytes, file_name)
        if not extracted_text.strip():
            raise ValueError(
                "Extracted text is empty. The document may be a scanned image, "
                "password-protected, or contain no readable text."
            )

        # 2. Chunk ─────────────────────────────────────────────────────────────
        chunk_size    = int(get_system_settings("chunk_size", 500))
        chunk_overlap = int(get_system_settings("chunk_overlap", 50))
        chunks = chunk_text(extracted_text, chunk_size, chunk_overlap)
        logger.info("%s → %d chunks (size=%d overlap=%d)", file_name, len(chunks), chunk_size, chunk_overlap)

        if not chunks:
            raise ValueError(
                f"No chunks produced from '{file_name}'. "
                "The file may be empty or contain only non-text content."
            )

        # 3. Embed in small batches with retry on rate limit ───────────────────
        embeddings: list[list[float]] = []
        for i in range(0, len(chunks), _EMBED_BATCH_SIZE):
            batch = chunks[i : i + _EMBED_BATCH_SIZE]
            logger.info(
                "Embedding batch %d–%d / %d for %s",
                i + 1, min(i + _EMBED_BATCH_SIZE, len(chunks)), len(chunks), file_name,
            )
            batch_vecs = _embed_with_retry(batch)
            embeddings.extend(batch_vecs)
            if i + _EMBED_BATCH_SIZE < len(chunks):
                time.sleep(_EMBED_BATCH_PAUSE)   # stay under free-tier rpm

        # 4. Build Pinecone + DB records ───────────────────────────────────────
        pinecone_vectors = []
        db_chunks: list[dict] = []
        for idx, (chunk_content, vector) in enumerate(zip(chunks, embeddings)):
            vid = f"vec_{doc_id}_{idx}"
            pinecone_vectors.append({
                "id": vid,
                "values": vector,
                "metadata": {"document_id": doc_id, "content": chunk_content},
            })
            db_chunks.append({
                "content": chunk_content,
                "chunk_index": idx,
                "vector_id": vid,
            })

        # 5. Upsert to Pinecone ────────────────────────────────────────────────
        logger.info("Upserting %d vectors to Pinecone for %s…", len(pinecone_vectors), file_name)
        upsert_vectors(pinecone_vectors)

        # 6. Persist chunk metadata ────────────────────────────────────────────
        add_document_chunks(doc_id, db_chunks)

        # 7. Mark as indexed ───────────────────────────────────────────────────
        update_document_status(doc_id, "indexed", chunk_count=len(chunks))
        logger.info("Indexed successfully: %s → %d chunks.", file_name, len(chunks))

    except Exception as exc:
        logger.error("Indexing failed for %s (%s): %s", file_name, doc_id, exc)
        update_document_status(doc_id, "error", error_message=str(exc))

@router.post("/upload-document", response_model=Dict[str, Any])
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Upload a file to storage and trigger the RAG indexing pipeline in the background."""
    try:
        supabase_client = get_supabase()
        
        # Read file contents
        file_bytes = await file.read()
        file_size = len(file_bytes)
        file_name = file.filename
        file_ext = file_name.split(".")[-1].lower()
        
        if file_ext not in ["pdf", "docx", "csv", "txt", "md"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file format: .{file_ext}. Supported formats are PDF, DOCX, CSV, TXT."
            )
            
        # 1. Upload to Supabase Storage
        bucket_name = "documents"
        storage_path = f"public/{uuid.uuid4()}_{file_name}"
        
        # Try to ensure the bucket exists
        try:
            supabase_client.storage.get_bucket(bucket_name)
        except Exception:
            try:
                supabase_client.storage.create_bucket(bucket_name, options={"public": True})
            except Exception as bucket_err:
                logger.warning(f"Could not verify/create bucket '{bucket_name}': {bucket_err}")
                
        logger.info(f"Uploading {file_name} to Supabase Storage path: {storage_path}")
        supabase_client.storage.from_(bucket_name).upload(storage_path, file_bytes, {"content-type": file.content_type})
        
        # 2. Insert DB record
        doc_record = create_document(file_name, storage_path, file_ext, file_size)
        doc_id = doc_record["id"]
        
        # 3. Schedule background processing
        background_tasks.add_task(process_and_index_document, doc_id, file_bytes, file_name)
        
        # Log action
        create_audit_log("upload_document", f"Uploaded document {file_name} (ID: {doc_id})", current_user["id"])
        
        return {
            "status": "success",
            "message": "File uploaded. Indexing has started in the background.",
            "document": doc_record
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document upload failed: {str(e)}"
        )

@router.get("/documents", response_model=List[Dict[str, Any]])
def list_documents(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Retrieve metadata for all documents."""
    return get_all_documents()

@router.delete("/documents/{doc_id}", response_model=Dict[str, Any])
def delete_document_endpoint(doc_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """Delete a document from database, Supabase Storage, and Pinecone vectors."""
    try:
        doc = get_document(doc_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found."
            )
            
        supabase_client = get_supabase()
        
        # 1. Delete vectors from Pinecone
        delete_vectors_by_document(doc_id)
        
        # 2. Delete file from storage
        bucket_name = "documents"
        try:
            supabase_client.storage.from_(bucket_name).remove([doc["storage_path"]])
        except Exception as storage_err:
            logger.warning(f"Could not remove file from storage path {doc['storage_path']}: {storage_err}")
            
        # 3. Delete DB record (Cascade deletes chunk references)
        delete_document(doc_id)
        
        # Audit logging
        create_audit_log("delete_document", f"Deleted document '{doc['name']}' (ID: {doc_id})", current_user["id"])
        
        return {
            "status": "success",
            "message": f"Document '{doc['name']}' deleted successfully."
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deletion failed: {str(e)}"
        )

@router.post("/reindex", response_model=Dict[str, Any])
def reindex_document(
    payload: ReindexRequestSchema,
    background_tasks: BackgroundTasks,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Download existing document from storage, wipe existing chunks, and run RAG indexing pipeline fresh."""
    try:
        doc_id = payload.document_id
        doc = get_document(doc_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found."
            )
            
        supabase_client = get_supabase()
        
        # 1. Download file bytes from Supabase storage
        bucket_name = "documents"
        logger.info(f"Downloading file for reindexing: {doc['storage_path']}")
        file_bytes = supabase_client.storage.from_(bucket_name).download(doc["storage_path"])
        
        # 2. Clear out older vectors from Pinecone
        delete_vectors_by_document(doc_id)
        
        # 3. DB cascade: delete old document_chunks records.
        # Calling delete on the document chunks directly
        supabase_client.table("document_chunks").delete().eq("document_id", doc_id).execute()
        
        # 4. Run pipeline in background
        background_tasks.add_task(process_and_index_document, doc_id, file_bytes, doc["name"])
        
        # Audit logging
        create_audit_log("reindex_document", f"Triggered reindex for document '{doc['name']}' (ID: {doc_id})", current_user["id"])
        
        return {
            "status": "success",
            "message": f"Reindexing started for document '{doc['name']}'."
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error reindexing document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reindexing failed: {str(e)}"
        )

def uuid_str() -> str:
    import uuid
    return str(uuid.uuid4())
