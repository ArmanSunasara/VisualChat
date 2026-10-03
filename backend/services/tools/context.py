"""ContextVar-based execution context for tools running in LangGraph / FastAPI."""

import contextvars
from typing import Optional
from uuid import UUID

from backend.services.tools.schemas import ToolContext

_current_tool_context: contextvars.ContextVar[ToolContext] = contextvars.ContextVar(
    "current_tool_context",
    default=ToolContext(),
)


def set_tool_context(
    conversation_id: Optional[UUID] = None,
    user_id: Optional[str] = None,
) -> contextvars.Token:
    """Set the active conversation and user context for tool execution."""
    new_context = ToolContext(conversation_id=conversation_id, user_id=user_id)
    return _current_tool_context.set(new_context)


def reset_tool_context(token: contextvars.Token) -> None:
    """Reset the tool context to its prior state."""
    _current_tool_context.reset(token)


def get_tool_context() -> ToolContext:
    """Return the current tool context."""
    return _current_tool_context.get()
