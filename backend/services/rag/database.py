"""PostgreSQL/pgvector schema for uploaded files, chunks, and message attachments."""

from backend.services.database import db


def init_rag_schema():
    with db() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            CREATE EXTENSION IF NOT EXISTS vector;
            CREATE TABLE IF NOT EXISTS documents (
                id UUID PRIMARY KEY,
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                content_type TEXT NOT NULL,
                file_data BYTEA NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS document_chunks (
                id BIGSERIAL PRIMARY KEY,
                document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                page_number INTEGER,
                content TEXT NOT NULL,
                embedding vector(384) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(document_id, chunk_index)
            );
            CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
            ON document_chunks USING hnsw (embedding vector_cosine_ops);
            CREATE INDEX IF NOT EXISTS document_chunks_conversation_idx
            ON document_chunks (conversation_id);
            CREATE TABLE IF NOT EXISTS message_documents (
                message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
                document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                PRIMARY KEY (message_id, document_id)
            );
            """
        )
