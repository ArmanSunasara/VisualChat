"""Structured logging for tool executions.

Ensures sensitive details (API keys, passwords, tokens, full document contents)
are never logged, adhering to security guidelines.
"""

import logging
import time
from contextlib import contextmanager
from typing import Generator, Optional

logger = logging.getLogger("chatboard.tools")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def log_tool_event(
    tool_name: str,
    status: str,
    duration_ms: float,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    """Emit a structured log line for a tool execution."""
    fields = [
        f"tool={tool_name}",
        f"status={status}",
        f"duration_ms={duration_ms:.1f}",
    ]
    if user_id:
        fields.append(f"user_id={user_id}")
    if conversation_id:
        fields.append(f"conversation_id={conversation_id}")
    if error:
        safe_error = error.replace("\n", " ").strip()[:150]
        fields.append(f"error={safe_error}")

    message = " ".join(fields)
    if status == "error":
        logger.error(message)
    else:
        logger.info(message)


@contextmanager
def record_tool_execution(
    tool_name: str,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
) -> Generator[dict, None, None]:
    """Context manager to measure tool execution duration and log results."""
    start_time = time.perf_counter()
    status_holder = {"status": "success", "error": None}
    try:
        yield status_holder
    except Exception as exc:
        status_holder["status"] = "error"
        status_holder["error"] = str(exc)
        raise
    finally:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        log_tool_event(
            tool_name=tool_name,
            status=status_holder["status"],
            duration_ms=duration_ms,
            user_id=user_id,
            conversation_id=conversation_id,
            error=status_holder.get("error"),
        )
