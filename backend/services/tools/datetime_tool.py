"""Timezone-aware date and time tool using Python standard library zoneinfo."""

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from langchain_core.tools import tool

from backend.services.tools.context import get_tool_context
from backend.services.tools.logging import record_tool_execution
from backend.services.tools.schemas import DateTimeInput

# Common timezone aliases and regional abbreviations mapped to standard IANA identifiers
TIMEZONE_ALIASES = {
    "utc": "UTC",
    "gmt": "GMT",
    "zulu": "UTC",
    "ist": "Asia/Kolkata",
    "india": "Asia/Kolkata",
    "london": "Europe/London",
    "uk": "Europe/London",
    "britain": "Europe/London",
    "new york": "America/New_York",
    "nyc": "America/New_York",
    "est": "America/New_York",
    "edt": "America/New_York",
    "chicago": "America/Chicago",
    "cst": "America/Chicago",
    "cdt": "America/Chicago",
    "denver": "America/Denver",
    "mst": "America/Denver",
    "mdt": "America/Denver",
    "los angeles": "America/Los_Angeles",
    "california": "America/Los_Angeles",
    "pst": "America/Los_Angeles",
    "pdt": "America/Los_Angeles",
    "paris": "Europe/Paris",
    "berlin": "Europe/Berlin",
    "tokyo": "Asia/Tokyo",
    "japan": "Asia/Tokyo",
    "jst": "Asia/Tokyo",
    "sydney": "Australia/Sydney",
    "dubai": "Asia/Dubai",
    "singapore": "Asia/Singapore",
    "toronto": "America/Toronto",
}


def _resolve_zoneinfo(tz_str: Optional[str]) -> tuple[ZoneInfo, str]:
    """Resolve a user-provided timezone string into a valid ZoneInfo instance."""
    if not tz_str or not tz_str.strip():
        return ZoneInfo("UTC"), "UTC"

    normalized = tz_str.strip().lower()
    canonical_name = TIMEZONE_ALIASES.get(normalized, tz_str.strip())

    try:
        return ZoneInfo(canonical_name), canonical_name
    except (ZoneInfoNotFoundError, KeyError, ValueError) as exc:
        raise ValueError(
            f"Unknown or invalid timezone: '{tz_str}'. "
            "Please provide a valid IANA timezone identifier such as 'UTC', "
            "'Asia/Kolkata', 'America/New_York', 'Europe/London', etc."
        ) from exc


@tool(args_schema=DateTimeInput)
def datetime_tool(timezone: Optional[str] = None) -> str:
    """Get the current date and time with timezone support.

    Use this tool when you need the current date, time, day of the week,
    or timezone conversions (e.g. 'UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/London').
    """
    context = get_tool_context()
    with record_tool_execution(
        "datetime_tool",
        user_id=context.user_id,
        conversation_id=str(context.conversation_id) if context.conversation_id else None,
    ) as status_holder:
        try:
            tz, canonical_name = _resolve_zoneinfo(timezone)
            now = datetime.now(tz)

            iso_timestamp = now.isoformat()
            formatted_date = now.strftime("%A, %B %d, %Y")
            formatted_time = now.strftime("%H:%M:%S (%I:%M:%S %p)")
            offset = now.strftime("%z")
            formatted_offset = f"UTC{offset[:3]}:{offset[3:]}" if offset else "UTC"

            return (
                f"Current Date & Time:\n"
                f"- Timestamp (ISO): {iso_timestamp}\n"
                f"- Date: {formatted_date}\n"
                f"- Time: {formatted_time}\n"
                f"- Timezone: {canonical_name} ({formatted_offset})"
            )
        except ValueError as exc:
            status_holder["status"] = "invalid_timezone"
            return f"Error: {exc}"
        except Exception as exc:
            status_holder["status"] = "error"
            status_holder["error"] = str(exc)
            return f"Error retrieving date/time: {exc}"
