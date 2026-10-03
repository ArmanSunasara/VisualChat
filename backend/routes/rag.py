from uuid import UUID

from fastapi import APIRouter, File, Request, UploadFile

from backend.routes.dependencies import require_database
from backend.services.rag.document_parser import MAX_FILE_BYTES
from backend.services.rag import service

router = APIRouter(prefix="/api/conversations/{conversation_id}/documents")


@router.get("")
def list_documents(conversation_id: UUID, request: Request):
    require_database(request)
    return service.list_documents(conversation_id)


@router.post("")
async def upload_document(
    conversation_id: UUID,
    request: Request,
    file: UploadFile = File(...),
):
    require_database(request)
    data = await file.read(MAX_FILE_BYTES + 1)
    return service.store_and_index(
        conversation_id,
        file.filename or "upload",
        file.content_type or "application/octet-stream",
        data,
    )


@router.delete("/{document_id}")
def delete_document(conversation_id: UUID, document_id: UUID, request: Request):
    require_database(request)
    return service.delete_document(conversation_id, document_id)
