"""Pydantic schemas for LangGraph tool inputs and outputs."""

from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class DocumentSearchInput(BaseModel):
    """Input for searching uploaded documents in the current conversation."""

    query: str = Field(
        ...,
        description="The search query or keyword phrase to find in uploaded documents.",
        min_length=1,
    )


class CalculatorInput(BaseModel):
    """Input for safe mathematical evaluation."""

    expression: str = Field(
        ...,
        description=(
            "The mathematical expression to evaluate (e.g., '25 * 18', '17.5% of 42000', "
            "'1000 / 7', 'sqrt(144) + 10'). Supports arithmetic, percentages, and common math functions."
        ),
        min_length=1,
    )


class WebSearchInput(BaseModel):
    """Input for external web search."""

    query: str = Field(
        ...,
        description="The search query to look up current information on the internet.",
        min_length=1,
    )


class DateTimeInput(BaseModel):
    """Input for querying current date and time."""

    timezone: Optional[str] = Field(
        default=None,
        description=(
            "Optional timezone name (e.g. 'UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London'). "
            "Defaults to 'UTC' if not specified."
        ),
    )


class FileAnalyzerInput(BaseModel):
    """Input for analyzing files uploaded to the current conversation."""

    filename: Optional[str] = Field(
        default=None,
        description="The name of the file to analyze (e.g. 'sales_data.csv', 'report.pdf'). If omitted, analyzes the conversation file.",
    )
    document_id: Optional[str] = Field(
        default=None,
        description="Optional UUID of the document to analyze.",
    )
    query: Optional[str] = Field(
        default=None,
        description="Optional specific question or aspect to inspect in the file (e.g. 'column names', 'row count', 'summary').",
    )


class UrlReaderInput(BaseModel):
    """Input for reading and extracting content from a web URL."""

    url: str = Field(
        ...,
        description="The full HTTP or HTTPS URL of the webpage to fetch and read.",
        min_length=1,
    )


class ToolContext(BaseModel):
    """Execution context containing conversation and user authorization."""

    conversation_id: Optional[UUID] = None
    user_id: Optional[str] = None
