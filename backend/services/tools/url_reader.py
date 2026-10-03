"""Safe, SSRF-protected URL reader tool using httpx and BeautifulSoup."""

import ipaddress
import os
import socket
import urllib.parse
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from langchain_core.tools import tool

from backend.services.tools.context import get_tool_context
from backend.services.tools.logging import record_tool_execution
from backend.services.tools.schemas import UrlReaderInput

DEFAULT_TIMEOUT = 10.0
DEFAULT_MAX_BYTES = 5_000_000
MAX_OUTPUT_CHARS = 8_000
MAX_REDIRECTS = 5


def validate_url_for_ssrf(url: str) -> tuple[bool, Optional[str]]:
    """Validate that the URL is a safe public HTTP/HTTPS endpoint, preventing SSRF attacks."""
    try:
        parsed = urllib.parse.urlsplit(url)
    except Exception as exc:
        return False, f"Invalid URL format: {exc}"

    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"Invalid protocol '{parsed.scheme}'. Only HTTP and HTTPS URLs are permitted."

    hostname = parsed.hostname
    if not hostname:
        return False, "URL must include a valid hostname."

    lower_host = hostname.lower().strip()
    if lower_host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        return False, "Access to localhost or loopback addresses is prohibited."

    if lower_host.endswith((".local", ".internal", ".localhost", ".localdomain", ".corp", ".home")):
        return False, "Access to internal domain names is prohibited."

    # Check direct IP addresses or resolve DNS
    try:
        addr_info = socket.getaddrinfo(lower_host, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as exc:
        return False, f"DNS resolution failed for hostname '{hostname}': {exc}"

    for _, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_reserved
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_unspecified
            ):
                return False, f"Access to private/internal network address ({ip_str}) is prohibited (SSRF protection)."
        except ValueError:
            return False, f"Invalid IP address resolved: {ip_str}"

    return True, None


def _extract_readable_text(html_content: str, source_url: str) -> str:
    """Parse HTML and extract clean text without scripts, styles, or navigation boilerplate."""
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract title
    title = soup.title.string.strip() if soup.title and soup.title.string else "No Title"

    # Remove non-content elements
    for element in soup.find_all(
        ["script", "style", "nav", "header", "footer", "aside", "noscript", "svg", "form", "iframe"]
    ):
        element.decompose()

    # Get body or full soup
    root = soup.body if soup.body else soup
    text = root.get_text(separator="\n", strip=True)

    # Collapse multiple consecutive newlines and extra spaces
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    cleaned_body = "\n\n".join(lines)

    truncated = False
    if len(cleaned_body) > MAX_OUTPUT_CHARS:
        cleaned_body = cleaned_body[:MAX_OUTPUT_CHARS] + "\n\n... [Content truncated for length] ..."
        truncated = True

    header = f"Page Title: {title}\nURL: {source_url}\n"
    if truncated:
        header += f"(Showing first {MAX_OUTPUT_CHARS} characters)\n"
    header += "-" * 50 + "\n\n"

    return header + (cleaned_body or "(Page has no readable text content)")


@tool(args_schema=UrlReaderInput)
def read_url(url: str) -> str:
    """Fetch, extract, and read the readable content of a public web URL.

    Safely retrieves the webpage, strips HTML boilerplate (scripts, styles, navigation),
    and returns readable text with the page title.
    Use this tool when requested to read, inspect, or summarize an online web link.
    """
    context = get_tool_context()
    with record_tool_execution(
        "url_reader",
        user_id=context.user_id,
        conversation_id=str(context.conversation_id) if context.conversation_id else None,
    ) as status_holder:
        raw_url = (url or "").strip()
        if not raw_url:
            status_holder["status"] = "invalid_input"
            return "Error: Please provide a URL to read."

        timeout_sec = float(os.getenv("URL_READER_TIMEOUT", DEFAULT_TIMEOUT))
        max_bytes = int(os.getenv("URL_READER_MAX_BYTES", DEFAULT_MAX_BYTES))

        current_url = raw_url
        redirect_count = 0
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        }

        try:
            with httpx.Client(timeout=timeout_sec, follow_redirects=False) as client:
                while True:
                    # SSRF check on every URL hop
                    is_safe, error_msg = validate_url_for_ssrf(current_url)
                    if not is_safe:
                        status_holder["status"] = "ssrf_blocked"
                        return f"Error: URL request blocked for security: {error_msg}"

                    with client.stream("GET", current_url, headers=headers) as response:
                        if response.is_redirect:
                            redirect_count += 1
                            if redirect_count > MAX_REDIRECTS:
                                status_holder["status"] = "too_many_redirects"
                                return "Error: Too many redirects while fetching URL."

                            location = response.headers.get("Location")
                            if not location:
                                status_holder["status"] = "invalid_redirect"
                                return "Error: Redirect response missing Location header."

                            current_url = urllib.parse.urljoin(current_url, location)
                            continue

                        response.raise_for_status()

                        # Stream content to enforce maximum size limit
                        downloaded = 0
                        chunks = []
                        for chunk in response.iter_bytes(chunk_size=8192):
                            downloaded += len(chunk)
                            if downloaded > max_bytes:
                                status_holder["status"] = "size_limit_exceeded"
                                return (
                                    f"Error: Webpage size exceeds maximum limit of "
                                    f"{max_bytes // (1024 * 1024)} MB."
                                )
                            chunks.append(chunk)

                        raw_content = b"".join(chunks)
                        break

            content_type = response.headers.get("content-type", "").lower()
            encoding = response.encoding or "utf-8"
            decoded_text = raw_content.decode(encoding, errors="replace")

            if "html" in content_type or "<html" in decoded_text.lower():
                return _extract_readable_text(decoded_text, current_url)

            # Plain text or other readable formats
            cleaned = decoded_text[:MAX_OUTPUT_CHARS]
            return f"URL: {current_url}\nContent-Type: {content_type}\n\n{cleaned}"

        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            status_holder["status"] = f"http_{status_code}"
            return f"Error: Web server responded with HTTP {status_code}."
        except httpx.TimeoutException:
            status_holder["status"] = "timeout"
            return "Error: Request timed out while attempting to reach URL."
        except httpx.RequestError as exc:
            status_holder["status"] = "request_error"
            return f"Error: Failed to connect to URL: {exc}"
        except Exception as exc:
            status_holder["status"] = "error"
            status_holder["error"] = str(exc)
            return f"Error reading URL: {exc}"
