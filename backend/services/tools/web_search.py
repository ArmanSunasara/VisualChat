"""Configurable, provider-agnostic web search tool using httpx."""

import os
import re
import urllib.parse
from typing import Any
import httpx
from bs4 import BeautifulSoup
from langchain_core.tools import tool

from backend.services.tools.context import get_tool_context
from backend.services.tools.logging import record_tool_execution
from backend.services.tools.schemas import WebSearchInput

DEFAULT_TIMEOUT = 10.0
MAX_RESULTS = 5


def _extract_domain(url: str) -> str:
    """Extract clean domain/host from URL."""
    try:
        parsed = urllib.parse.urlsplit(url)
        return parsed.netloc or "web"
    except Exception:
        return "web"


def _search_tavily(query: str, api_key: str, api_url: str | None) -> list[dict[str, str]]:
    url = api_url or "https://api.tavily.com/search"
    response = httpx.post(
        url,
        json={"query": query, "max_results": MAX_RESULTS, "search_depth": "basic"},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    items = []
    for row in data.get("results", []):
        link = row.get("url", "")
        items.append(
            {
                "title": row.get("title", "No Title"),
                "url": link,
                "snippet": row.get("content", "").strip()[:350],
                "domain": _extract_domain(link),
            }
        )
    return items


def _search_brave(query: str, api_key: str, api_url: str | None) -> list[dict[str, str]]:
    url = api_url or "https://api.search.brave.com/res/v1/web/search"
    response = httpx.get(
        url,
        params={"q": query, "count": MAX_RESULTS},
        headers={"Accept": "application/json", "X-Subscription-Token": api_key},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    items = []
    for row in data.get("web", {}).get("results", []):
        link = row.get("url", "")
        items.append(
            {
                "title": row.get("title", "No Title"),
                "url": link,
                "snippet": row.get("description", "").strip()[:350],
                "domain": _extract_domain(link),
            }
        )
    return items


def _search_serpapi(query: str, api_key: str, api_url: str | None) -> list[dict[str, str]]:
    url = api_url or "https://serpapi.com/search.json"
    response = httpx.get(
        url,
        params={"q": query, "api_key": api_key, "num": MAX_RESULTS},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    items = []
    for row in data.get("organic_results", []):
        link = row.get("link", "")
        items.append(
            {
                "title": row.get("title", "No Title"),
                "url": link,
                "snippet": row.get("snippet", "").strip()[:350],
                "domain": _extract_domain(link),
            }
        )
    return items


def _search_google(
    query: str, api_key: str, engine_id: str | None, api_url: str | None
) -> list[dict[str, str]]:
    if not engine_id:
        raise ValueError("Google search requires WEB_SEARCH_ENGINE_ID to be configured.")
    url = api_url or "https://www.googleapis.com/customsearch/v1"
    response = httpx.get(
        url,
        params={"key": api_key, "cx": engine_id, "q": query, "num": MAX_RESULTS},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    items = []
    for row in data.get("items", []):
        link = row.get("link", "")
        items.append(
            {
                "title": row.get("title", "No Title"),
                "url": link,
                "snippet": row.get("snippet", "").strip()[:350],
                "domain": _extract_domain(link),
            }
        )
    return items


def _search_searxng(query: str, api_url: str | None) -> list[dict[str, str]]:
    url = (api_url or "http://localhost:8080").rstrip("/") + "/search"
    response = httpx.get(
        url,
        params={"q": query, "format": "json"},
        timeout=DEFAULT_TIMEOUT,
    )
    response.raise_for_status()
    data = response.json()
    items = []
    for row in data.get("results", [])[:MAX_RESULTS]:
        link = row.get("url", "")
        items.append(
            {
                "title": row.get("title", "No Title"),
                "url": link,
                "snippet": row.get("content", "").strip()[:350],
                "domain": _extract_domain(link),
            }
        )
    return items


def _search_duckduckgo(query: str) -> list[dict[str, str]]:
    """Query DuckDuckGo HTML endpoint without requiring a paid API key."""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }
    response = httpx.post(
        "https://html.duckduckgo.com/html/",
        data={"q": query},
        headers=headers,
        timeout=DEFAULT_TIMEOUT,
        follow_redirects=True,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    results = []
    for result_div in soup.find_all("div", class_="result"):
        title_tag = result_div.find("a", class_="result__a")
        snippet_tag = result_div.find("a", class_="result__snippet")
        if not title_tag:
            continue

        raw_url = title_tag.get("href", "")
        # DuckDuckGo sometimes wraps URLs in /l/?uddg=...
        if "/l/?uddg=" in raw_url:
            query_match = re.search(r"uddg=([^&]+)", raw_url)
            if query_match:
                raw_url = urllib.parse.unquote(query_match.group(1))

        title = title_tag.get_text(strip=True)
        snippet = snippet_tag.get_text(strip=True) if snippet_tag else ""

        if raw_url.startswith("http"):
            results.append(
                {
                    "title": title or "No Title",
                    "url": raw_url,
                    "snippet": snippet[:350],
                    "domain": _extract_domain(raw_url),
                }
            )
            if len(results) >= MAX_RESULTS:
                break
    return results


@tool(args_schema=WebSearchInput)
def web_search(query: str) -> str:
    """Retrieve current information, news, and facts from the internet.

    Use this tool when you need up-to-date knowledge, external facts,
    or online documentation not present in local chat context.
    """
    context = get_tool_context()
    with record_tool_execution(
        "web_search",
        user_id=context.user_id,
        conversation_id=str(context.conversation_id) if context.conversation_id else None,
    ) as status_holder:
        cleaned_query = (query or "").strip()
        if not cleaned_query:
            status_holder["status"] = "invalid_input"
            return "Please provide a search query."

        provider = os.getenv("WEB_SEARCH_PROVIDER", "").strip().lower()
        api_key = os.getenv("WEB_SEARCH_API_KEY", "").strip()
        api_url = os.getenv("WEB_SEARCH_API_URL", "").strip() or None
        engine_id = os.getenv("WEB_SEARCH_ENGINE_ID", "").strip() or None

        # Auto-detect or default provider
        if not provider:
            if api_key.startswith("tvly-"):
                provider = "tavily"
            elif api_key.startswith("BSAI"):
                provider = "brave"
            elif api_key:
                provider = "tavily"
            else:
                provider = "duckduckgo"

        # Check required credentials for provider
        if provider in ("tavily", "brave", "serpapi", "google") and not api_key:
            status_holder["status"] = "missing_api_key"
            return (
                f"Tool unavailable: Web search provider '{provider}' requires "
                "WEB_SEARCH_API_KEY to be set in environment."
            )

        try:
            if provider == "tavily":
                results = _search_tavily(cleaned_query, api_key, api_url)
            elif provider == "brave":
                results = _search_brave(cleaned_query, api_key, api_url)
            elif provider == "serpapi":
                results = _search_serpapi(cleaned_query, api_key, api_url)
            elif provider == "google":
                results = _search_google(cleaned_query, api_key, engine_id, api_url)
            elif provider == "searxng":
                results = _search_searxng(cleaned_query, api_url)
            elif provider == "duckduckgo":
                results = _search_duckduckgo(cleaned_query)
            else:
                status_holder["status"] = "unsupported_provider"
                return f"Tool unavailable: Unsupported search provider '{provider}'."

        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            status_holder["status"] = f"http_{status}"
            if status in (401, 403):
                return f"Web search failed: Authentication error with provider '{provider}'. Please verify your WEB_SEARCH_API_KEY."
            if status == 429:
                return f"Web search failed: Rate limit exceeded for provider '{provider}'. Please try again later."
            return f"Web search failed: Provider returned HTTP {status}."
        except httpx.TimeoutException:
            status_holder["status"] = "timeout"
            return "Web search failed: Search provider request timed out."
        except Exception as exc:
            status_holder["status"] = "error"
            status_holder["error"] = str(exc)
            return f"Web search error: {exc}"

        if not results:
            return f"No web search results found for query: '{cleaned_query}'."

        formatted_results = []
        for index, item in enumerate(results, start=1):
            formatted_results.append(
                f"[{index}] {item['title']}\n"
                f"    URL: {item['url']}\n"
                f"    Source: {item['domain']}\n"
                f"    Snippet: {item['snippet']}"
            )

        return (
            f"Web search results for '{cleaned_query}' (via {provider}):\n\n"
            + "\n\n".join(formatted_results)
        )
