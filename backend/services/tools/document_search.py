"""Document search tool reusing the existing RAG retrieval service."""

from langchain_core.tools import tool

from backend.services.rag.retrieval import retrieve
from backend.services.tools.context import get_tool_context
from backend.services.tools.logging import record_tool_execution
from backend.services.tools.schemas import DocumentSearchInput


@tool(args_schema=DocumentSearchInput)
def document_search(query: str) -> str:
    """Search uploaded documents and files in the current conversation.

    Use this tool when you need to retrieve specific information, excerpts,
    or details from documents previously uploaded to this chat.
    """
    context = get_tool_context()
    conv_id = context.conversation_id
    user_id = context.user_id

    with record_tool_execution(
        "document_search",
        user_id=user_id,
        conversation_id=str(conv_id) if conv_id else None,
    ) as status_holder:
        cleaned_query = (query or "").strip()
        if not cleaned_query:
            status_holder["status"] = "invalid_input"
            return "Please provide a non-empty search query."

        if not conv_id:
            status_holder["status"] = "missing_context"
            return "Tool unavailable: No active conversation context found to search documents."

        try:
            results = retrieve(conversation_id=conv_id, question=cleaned_query, limit=6)
        except Exception as exc:
            status_holder["status"] = "error"
            status_holder["error"] = str(exc)
            return f"Error searching documents: {exc}"

        if not results:
            return f"No relevant document excerpts found for query: '{cleaned_query}'."

        formatted_excerpts = []
        for index, item in enumerate(results, start=1):
            doc_id = item.get("document_id", "N/A")
            filename = item.get("filename", "unknown")
            page_num = item.get("page_number")
            page_info = f", page/slide {page_num}" if page_num is not None else ""
            sim = item.get("similarity", 0.0)
            content = item.get("content", "").strip()

            formatted_excerpts.append(
                f"[{index}] Source: {filename}{page_info} (Document ID: {doc_id}, Score: {sim:.2f})\n{content}"
            )

        return (
            f"Found {len(results)} relevant excerpt(s) in uploaded documents:\n\n"
            + "\n\n".join(formatted_excerpts)
        )
