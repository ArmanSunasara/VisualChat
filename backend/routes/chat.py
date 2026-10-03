from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from backend.routes.dependencies import require_database
from backend.services.chat.schemas import ChatRequest, MODELS, NewConversationRequest
from backend.services.chat import service

router = APIRouter(prefix="/api")


@router.get("/models")
def models():
    return {"chat": MODELS}


@router.get("/conversations")
def conversations(request: Request):
    require_database(request)
    return service.list_conversations()


@router.post("/conversations")
def create_conversation(body: NewConversationRequest, request: Request):
    require_database(request)
    return service.create_conversation(body.model)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: UUID, request: Request):
    require_database(request)
    return service.get_conversation(conversation_id)


@router.patch("/conversations/{conversation_id}/pin")
def toggle_pin(conversation_id: UUID, request: Request):
    require_database(request)
    return service.toggle_pin(conversation_id)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: UUID, request: Request):
    require_database(request)
    return service.delete_conversation(conversation_id)


@router.post("/chat")
def send_message(body: ChatRequest, request: Request):
    require_database(request)
    return StreamingResponse(
        service.stream_message(body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
