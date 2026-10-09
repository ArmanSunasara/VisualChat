from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from backend.routes.dependencies import require_database, get_current_user
from backend.services.chat.schemas import ChatRequest, MODELS, NewConversationRequest, CreateBranchRequest
from backend.services.chat import service

router = APIRouter(prefix="/api")


@router.get("/models")
def models():
    return {"chat": MODELS}


@router.get("/conversations")
def conversations(request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return service.list_conversations(user_id)


@router.post("/conversations")
def create_conversation(body: NewConversationRequest, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return service.create_conversation(body.model, user_id)


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: UUID, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return service.get_conversation(conversation_id, user_id)


@router.patch("/conversations/{conversation_id}/pin")
def toggle_pin(conversation_id: UUID, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return service.toggle_pin(conversation_id, user_id)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: UUID, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return service.delete_conversation(conversation_id, user_id)


# Branch endpoints
@router.post("/conversations/{conversation_id}/branches")
def create_branch(conversation_id: UUID, body: CreateBranchRequest, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    import fastapi
    if body.parent_conversation_id != conversation_id:
        raise fastapi.HTTPException(400, "parent_conversation_id must match URL conversation_id")
    return service.create_branch(body, user_id)


@router.get("/conversations/{conversation_id}/branches")
def list_branches(conversation_id: UUID, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return service.list_branches(conversation_id, user_id)


@router.post("/chat")
def send_message(body: ChatRequest, request: Request):
    require_database(request)
    user_id = get_current_user(request)
    return StreamingResponse(
        service.stream_message(body, user_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
