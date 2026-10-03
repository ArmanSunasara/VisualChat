"""Request and model definitions for chat endpoints."""

from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    conversation_id: UUID | None = None
    model: str | None = None
    attachment_ids: list[UUID] = Field(default_factory=list, max_length=10)


class NewConversationRequest(BaseModel):
    model: str | None = None


MODELS = [
    {"id": "openai/gpt-oss-20b", "name": "GPT OSS 20B", "category": "Everyday", "description": "General purpose"},
    {"id": "openai/gpt-oss-120b", "name": "GPT OSS 120B", "category": "Coding", "description": "Complex reasoning"},
    {"id": "qwen/qwen3.8-27b", "name": "Qwen 3.8 27B", "category": "Coding", "description": "Technical tasks"},
]
