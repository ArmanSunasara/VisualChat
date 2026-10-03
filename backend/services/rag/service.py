"""Document storage, extraction, and indexing operations."""

from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException

from backend.services.database import db
from backend.services.rag.document_parser import (
    MAX_FILE_BYTES,
    SUPPORTED_EXTENSIONS,
    extract_document,
)
from backend.services.rag.retrieval import index_document


def list_documents(conversation_id: UUID):
    with db() as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT id,filename,content_type,created_at FROM documents WHERE conversation_id=%s ORDER BY created_at",
            (conversation_id,),
        )
        return {
            "documents": [
                {"id": str(row[0]), "filename": row[1], "content_type": row[2], "created_at": row[3]}
                for row in cursor.fetchall()
            ]
        }


def store_and_index(conversation_id: UUID, filename: str, content_type: str, data: bytes):
    safe_filename = Path(filename or "upload").name
    if Path(safe_filename).suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise HTTPException(415, "Upload a PDF, DOCX, PPTX, CSV, TXT, or JSON file.")
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, "Files must be 25 MB or smaller.")
    if not data:
        raise HTTPException(400, "The selected file is empty.")
    try:
        sections = extract_document(safe_filename, data)
    except Exception as error:
        raise HTTPException(400, f"Could not read this document: {error}") from error
    if not any(text.strip() for _, text in sections):
        raise HTTPException(422, "No readable text was found in this file.")

    document_id = uuid4()
    try:
        with db() as connection, connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO documents(id,conversation_id,filename,content_type,file_data) VALUES (%s,%s,%s,%s,%s)",
                (document_id, conversation_id, safe_filename, content_type or "application/octet-stream", data),
            )
        chunk_count = index_document(document_id, conversation_id, sections)
    except Exception as error:
        with db() as connection, connection.cursor() as cursor:
            cursor.execute("DELETE FROM documents WHERE id=%s", (document_id,))
        raise HTTPException(503, f"Could not index document: {error}") from error
    return {
        "id": str(document_id),
        "filename": safe_filename,
        "content_type": content_type,
        "chunks": chunk_count,
    }


def delete_document(conversation_id: UUID, document_id: UUID):
    with db() as connection, connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM documents WHERE id=%s AND conversation_id=%s RETURNING id",
            (document_id, conversation_id),
        )
        if not cursor.fetchone():
            raise HTTPException(404, "Document not found")
    return {"deleted": True}
