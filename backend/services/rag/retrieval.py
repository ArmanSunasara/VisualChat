from collections.abc import Sequence
from uuid import UUID

import numpy as np

from backend.services.database import db
from backend.services.rag.embeddings import embed_texts

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 160


def chunk_sections(sections: list[tuple[int | None, str]]) -> list[tuple[int, int | None, str]]:
    chunks: list[tuple[int, int | None, str]] = []
    for page_number, section in sections:
        text = " ".join(section.split())
        start = 0
        while start < len(text):
            end = min(start + CHUNK_SIZE, len(text))
            if end < len(text):
                boundary = text.rfind(" ", start + CHUNK_SIZE // 2, end)
                if boundary > start:
                    end = boundary
            content = text[start:end].strip()
            if content:
                chunks.append((len(chunks), page_number, content))
            if end == len(text):
                break
            start = max(end - CHUNK_OVERLAP, start + 1)
    return chunks


def index_document(document_id, conversation_id, sections):
    chunks = chunk_sections(sections)
    if not chunks:
        raise ValueError("No readable text was found in this file.")
    vectors = [np.asarray(vector, dtype=np.float32) for vector in embed_texts([chunk[2] for chunk in chunks])]
    with db() as connection, connection.cursor() as cursor:
        cursor.executemany(
            """INSERT INTO document_chunks
               (document_id,conversation_id,chunk_index,page_number,content,embedding)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            [
                (document_id, conversation_id, index, page, content, vector)
                for (index, page, content), vector in zip(chunks, vectors)
            ],
        )
    return len(chunks)


def retrieve(
    conversation_id: UUID,
    question: str,
    *,
    document_ids: Sequence[UUID] | None = None,
    limit: int = 6,
):
    """Embed a question and return its most similar chunks in this conversation.

    When a message names files, ``document_ids`` keeps the answer grounded in
    those files instead of accidentally using an older upload in the same chat.
    """
    cleaned_question = question.strip()
    if not cleaned_question:
        return []

    # The model used here is deliberately the same model used while indexing,
    # so query and chunk vectors share an embedding space.
    query_vector = np.asarray(embed_texts([cleaned_question])[0], dtype=np.float32)
    limit = max(1, min(limit, 12))
    file_filter = ""
    parameters = [query_vector, conversation_id]
    if document_ids:
        file_filter = " AND dc.document_id = ANY(%s)"
        parameters.append(list(dict.fromkeys(document_ids)))
    parameters.extend([query_vector, limit])

    with db() as connection, connection.cursor() as cursor:
        cursor.execute(
            f"""SELECT dc.document_id, dc.chunk_index, dc.content, d.filename, dc.page_number,
                      1 - (dc.embedding <=> %s) AS similarity
               FROM document_chunks dc
               JOIN documents d ON d.id=dc.document_id
               WHERE dc.conversation_id=%s{file_filter}
               ORDER BY dc.embedding <=> %s
               LIMIT %s""",
            parameters,
        )
        results = cursor.fetchall()
    return [
        {
            "document_id": str(row[0]),
            "chunk_index": row[1],
            "content": row[2],
            "filename": row[3],
            "page_number": row[4],
            "similarity": float(row[5]),
        }
        for row in results
    ]
