"""Extensible LangGraph tool suite for ChatBoard."""

from backend.services.tools.calculator import calculator
from backend.services.tools.context import (
    get_tool_context,
    reset_tool_context,
    set_tool_context,
)
from backend.services.tools.datetime_tool import datetime_tool
from backend.services.tools.document_search import document_search
from backend.services.tools.file_analyzer import file_analyzer
from backend.services.tools.registry import (
    TOOL_REGISTRY,
    calculator_tool,
    datetime_tool_instance,
    document_search_tool,
    file_analyzer_tool,
    get_tools,
    register_tool,
    url_reader_tool,
    web_search_tool,
)
from backend.services.tools.url_reader import read_url
from backend.services.tools.web_search import web_search

__all__ = [
    "get_tools",
    "register_tool",
    "TOOL_REGISTRY",
    "document_search",
    "document_search_tool",
    "calculator",
    "calculator_tool",
    "web_search",
    "web_search_tool",
    "datetime_tool",
    "datetime_tool_instance",
    "file_analyzer",
    "file_analyzer_tool",
    "read_url",
    "url_reader_tool",
    "set_tool_context",
    "get_tool_context",
    "reset_tool_context",
]
