"""File analyzer tool inspecting files uploaded to the current conversation."""

import csv
import io
import json
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from langchain_core.tools import tool

from backend.services.database import db
from backend.services.rag.document_parser import (
    MAX_FILE_BYTES,
    extract_document,
)
from backend.services.tools.context import get_tool_context
from backend.services.tools.logging import record_tool_execution
from backend.services.tools.schemas import FileAnalyzerInput

PREVIEW_ROWS_MAX = 5
MAX_ANALYSIS_TEXT_CHARS = 4000


def _analyze_csv(filename: str, file_data: bytes) -> str:
    """Analyze CSV file calculating row/column counts, headers, and numeric summary."""
    try:
        text = file_data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_data.decode("latin-1", errors="replace")

    reader = csv.reader(io.StringIO(text))
    try:
        headers = next(reader)
    except StopIteration:
        return f"File '{filename}' is an empty CSV file."

    row_count = 0
    column_count = len(headers)
    sample_rows: list[list[str]] = []

    # Track column non-null and numeric counts
    non_null_counts = [0] * column_count
    numeric_values: dict[int, list[float]] = {i: [] for i in range(column_count)}

    for row in reader:
        row_count += 1
        if len(sample_rows) < PREVIEW_ROWS_MAX:
            sample_rows.append(row[:column_count])

        for col_idx, cell in enumerate(row[:column_count]):
            stripped = cell.strip()
            if stripped:
                non_null_counts[col_idx] += 1
                try:
                    num = float(stripped.replace(",", ""))
                    numeric_values[col_idx].append(num)
                except ValueError:
                    pass

    # Build column summary
    columns_summary = []
    for idx, header in enumerate(headers):
        nn = non_null_counts[idx]
        nums = numeric_values[idx]
        if nums and len(nums) == nn:
            avg_val = sum(nums) / len(nums)
            min_val = min(nums)
            max_val = max(nums)
            col_info = (
                f"- '{header}': numeric (min={min_val:.2f}, max={max_val:.2f}, avg={avg_val:.2f}, count={nn})"
            )
        else:
            col_info = f"- '{header}': text/categorical (non-null={nn}/{row_count})"
        columns_summary.append(col_info)

    # Format sample table preview
    preview_lines = [" | ".join(headers)]
    preview_lines.append("-" * len(preview_lines[0]))
    for row in sample_rows:
        preview_lines.append(" | ".join(cell.strip() for cell in row))

    return (
        f"File Analysis for CSV: '{filename}'\n"
        f"- Total Rows: {row_count}\n"
        f"- Total Columns: {column_count}\n"
        f"- Column Details:\n"
        + "\n".join(columns_summary)
        + f"\n\nSample Preview (First {len(sample_rows)} rows):\n"
        + "\n".join(preview_lines)
    )


def _analyze_json(filename: str, file_data: bytes) -> str:
    """Analyze JSON structure and properties."""
    try:
        text = file_data.decode("utf-8")
        parsed = json.loads(text)
    except Exception as exc:
        return f"File '{filename}' contains invalid JSON: {exc}"

    if isinstance(parsed, list):
        count = len(parsed)
        sample = parsed[0] if count > 0 else None
        sample_keys = list(sample.keys()) if isinstance(sample, dict) else "primitive"
        return (
            f"File Analysis for JSON: '{filename}'\n"
            f"- Structure: JSON Array (List)\n"
            f"- Total Elements: {count}\n"
            f"- Element Schema Keys: {sample_keys}\n"
            f"- Sample Element:\n{json.dumps(sample, indent=2)[:MAX_ANALYSIS_TEXT_CHARS]}"
        )

    if isinstance(parsed, dict):
        keys = list(parsed.keys())
        return (
            f"File Analysis for JSON: '{filename}'\n"
            f"- Structure: JSON Object (Dictionary)\n"
            f"- Top-level Keys ({len(keys)}): {keys[:25]}\n"
            f"- Sample Content:\n{json.dumps(parsed, indent=2)[:MAX_ANALYSIS_TEXT_CHARS]}"
        )

    return f"File '{filename}' contains top-level JSON primitive: {type(parsed).__name__}"


def _analyze_txt(filename: str, file_data: bytes) -> str:
    """Analyze plain text document."""
    text = file_data.decode("utf-8", errors="replace")
    lines = text.splitlines()
    words = text.split()
    preview = "\n".join(lines[:15])

    return (
        f"File Analysis for Text: '{filename}'\n"
        f"- Total Lines: {len(lines)}\n"
        f"- Total Words: {len(words)}\n"
        f"- Total Characters: {len(text)}\n\n"
        f"Content Preview:\n{preview[:MAX_ANALYSIS_TEXT_CHARS]}"
    )


def _analyze_document(filename: str, file_data: bytes, query: Optional[str] = None) -> str:
    """Analyze PDF, Word (DOCX), or PowerPoint (PPTX) document using existing extract_document."""
    sections = extract_document(filename, file_data)
    total_sections = len(sections)
    total_text = " ".join(text for _, text in sections)
    total_words = len(total_text.split())
    total_chars = len(total_text)

    doc_type = Path(filename).suffix.upper().lstrip(".")
    page_label = "Slides" if doc_type == "PPTX" else "Pages"

    outline_parts = []
    for page_num, text in sections[:5]:
        loc = f"{page_label[:-1]} {page_num}" if page_num is not None else "Section"
        snippet = " ".join(text.split())[:200]
        if snippet:
            outline_parts.append(f"- [{loc}]: {snippet}...")

    matched_sections = []
    if query:
        query_words = set(query.lower().split())
        for page_num, text in sections:
            if any(w in text.lower() for w in query_words):
                loc = f"{page_label[:-1]} {page_num}" if page_num is not None else "Section"
                matched_sections.append(f"[{loc}]: {text.strip()[:350]}")
                if len(matched_sections) >= 3:
                    break

    summary = (
        f"File Analysis for {doc_type} Document: '{filename}'\n"
        f"- Total {page_label}: {total_sections}\n"
        f"- Total Words: {total_words}\n"
        f"- Total Characters: {total_chars}\n\n"
        f"Document Outline (First {len(outline_parts)} {page_label}):\n"
        + ("\n".join(outline_parts) if outline_parts else "(No readable text detected)")
    )

    if matched_sections:
        summary += (
            f"\n\nExcerpts matching '{query}':\n"
            + "\n\n".join(matched_sections)
        )

    return summary


@tool(args_schema=FileAnalyzerInput)
def file_analyzer(
    filename: Optional[str] = None,
    document_id: Optional[str] = None,
    query: Optional[str] = None,
) -> str:
    """Analyze, inspect structure, and extract summaries of files uploaded to the current conversation.

    Supports PDF, DOCX, PPTX, CSV, TXT, and JSON files.
    Provides metadata (row/column counts, headers, and column statistics for CSVs;
    page/slide counts, text statistics, and outline for PDF/DOCX/PPTX; structure for JSON).
    Use this tool when asked to analyze a file, inspect columns or rows, or summarize an uploaded document.
    """
    context = get_tool_context()
    conv_id = context.conversation_id
    user_id = context.user_id

    with record_tool_execution(
        "file_analyzer",
        user_id=user_id,
        conversation_id=str(conv_id) if conv_id else None,
    ) as status_holder:
        if not conv_id:
            status_holder["status"] = "missing_context"
            return "Tool unavailable: No active conversation context found to analyze files."

        # Fetch all files authorized for this conversation from the database
        with db() as connection, connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, filename, content_type, file_data, created_at "
                "FROM documents WHERE conversation_id = %s ORDER BY created_at DESC",
                (conv_id,),
            )
            files = cursor.fetchall()

        if not files:
            status_holder["status"] = "no_files"
            return "No files have been uploaded to this conversation yet."

        # Match requested file
        target_file = None
        if document_id:
            try:
                target_uuid = UUID(document_id.strip())
                for f in files:
                    if f[0] == target_uuid:
                        target_file = f
                        break
            except ValueError:
                pass

        if not target_file and filename:
            cleaned_name = Path(filename.strip()).name.lower()
            for f in files:
                current_name = f[1].lower()
                if current_name == cleaned_name or cleaned_name in current_name:
                    target_file = f
                    break

        if not target_file:
            if filename or document_id:
                available = ", ".join(f"'{f[1]}' (id: {f[0]})" for f in files)
                return (
                    f"File '{filename or document_id}' was not found in this chat. "
                    f"Available files in this conversation: {available}"
                )
            if len(files) == 1:
                target_file = files[0]
            else:
                available = "\n".join(f"- {f[1]} (ID: {f[0]})" for f in files)
                return (
                    f"Multiple files are present in this chat. Please specify which file to analyze:\n{available}"
                )

        _, doc_filename, _, file_data, _ = target_file
        data_bytes = bytes(file_data)

        if len(data_bytes) > MAX_FILE_BYTES:
            status_holder["status"] = "file_oversized"
            return f"File '{doc_filename}' exceeds the maximum allowed file size of 25 MB."

        ext = Path(doc_filename).suffix.lower()

        try:
            if ext == ".csv":
                return _analyze_csv(doc_filename, data_bytes)
            if ext == ".json":
                return _analyze_json(doc_filename, data_bytes)
            if ext == ".txt":
                return _analyze_txt(doc_filename, data_bytes)
            if ext in (".pdf", ".docx", ".pptx"):
                return _analyze_document(doc_filename, data_bytes, query=query)
            if ext == ".xlsx":
                return (
                    f"File '{doc_filename}' is an Excel spreadsheet. For rich tabular analysis, "
                    "please export the sheet as CSV or upload a CSV file."
                )

            status_holder["status"] = "unsupported_type"
            return (
                f"File '{doc_filename}' has unsupported format '{ext}'. "
                "Supported formats for analysis are: PDF, DOCX, PPTX, CSV, TXT, JSON."
            )
        except Exception as exc:
            status_holder["status"] = "error"
            status_holder["error"] = str(exc)
            return f"Error analyzing file '{doc_filename}': {exc}"
