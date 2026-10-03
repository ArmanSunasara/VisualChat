"""Central tool registry for LangGraph and agent execution."""

from typing import Optional, Sequence
from uuid import UUID

from langchain_core.tools import BaseTool

from backend.services.tools.calculator import calculator
from backend.services.tools.context import set_tool_context
from backend.services.tools.datetime_tool import datetime_tool
from backend.services.tools.document_search import document_search
from backend.services.tools.file_analyzer import file_analyzer
from backend.services.tools.url_reader import read_url
from backend.services.tools.web_search import web_search

# Base tool instances
document_search_tool: BaseTool = document_search
calculator_tool: BaseTool = calculator
web_search_tool: BaseTool = web_search
datetime_tool_instance: BaseTool = datetime_tool
file_analyzer_tool: BaseTool = file_analyzer
url_reader_tool: BaseTool = read_url

# Registry mapping tool names to tool instances for dynamic extensibility
TOOL_REGISTRY: dict[str, BaseTool] = {
    "document_search": document_search_tool,
    "calculator": calculator_tool,
    "web_search": web_search_tool,
    "datetime_tool": datetime_tool_instance,
    "file_analyzer": file_analyzer_tool,
    "read_url": url_reader_tool,
}


def register_tool(name: str, tool: BaseTool) -> None:
    """Register an additional tool into the global registry."""
    TOOL_REGISTRY[name] = tool


def get_tools(
    conversation_id: Optional[UUID] = None,
    user_id: Optional[str] = None,
    names: Optional[Sequence[str]] = None,
) -> list[BaseTool]:
    """Return all configured tools for LangGraph agent execution.

    Optionally sets the execution context (conversation_id and user_id)
    and allows filtering by tool names.
    """
    if conversation_id is not None or user_id is not None:
        set_tool_context(conversation_id=conversation_id, user_id=user_id)

    if names:
        return [TOOL_REGISTRY[name] for name in names if name in TOOL_REGISTRY]

    return list(TOOL_REGISTRY.values())
