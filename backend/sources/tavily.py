"""Tavily search API for web snippet mode."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from digest.config import settings

logger = logging.getLogger(__name__)

TAVILY_URL = "https://api.tavily.com/search"

# Домены по умолчанию для «только научные источники» (Tavily include_domains).
# Можно переопределить через TAVILY_INCLUDE_DOMAINS в .env (через запятую).
DEFAULT_SCHOLARLY_DOMAINS: list[str] = [
    "arxiv.org",
    "pubmed.ncbi.nlm.nih.gov",
    "ncbi.nlm.nih.gov",
    "semanticscholar.org",
    "doi.org",
    "nature.com",
    "science.org",
    "springer.com",
    "sciencedirect.com",
    "frontiersin.org",
    "plos.org",
    "biorxiv.org",
    "medrxiv.org",
    "europepmc.org",
    "ieee.org",
    "acm.org",
    "mdpi.com",
    "wiley.com",
    "cell.com",
]


def resolve_scholarly_include_domains() -> list[str]:
    raw = (settings.tavily_include_domains or "").strip()
    if raw:
        out = [d.strip().lower() for d in raw.split(",") if d.strip()]
        return out if out else list(DEFAULT_SCHOLARLY_DOMAINS)
    return list(DEFAULT_SCHOLARLY_DOMAINS)


def build_tavily_query(
    base_query: str,
    additional_terms: list[str] | None,
) -> str:
    parts: list[str] = []
    prefix = (settings.tavily_query_prefix or "").strip()
    if prefix:
        parts.append(prefix)
    b = base_query.strip()
    if b:
        parts.append(b)
    for t in additional_terms or []:
        t = (t or "").strip()
        if t:
            parts.append(t)
    q = " ".join(parts).strip()
    return q[:2000]


async def fetch_tavily_snippets(
    client: httpx.AsyncClient,
    query: str,
    max_results: int,
    *,
    include_domains: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Returns list of {title, url, snippet} and warnings.

    include_domains: если задан непустой список — Tavily ищет только по этим доменам
    (научные журналы/репозитории). None или [] = без ограничения по доменам (весь интернет).
    """
    key = (settings.tavily_api_key or "").strip()
    if not key:
        return [], ["tavily_api_key_missing"]

    n = max(1, min(max_results, 20))
    payload: dict[str, Any] = {
        "api_key": key,
        "query": query.strip()[:2000],
        "max_results": n,
        "search_depth": "basic",
        "include_answer": False,
    }
    if include_domains:
        payload["include_domains"] = include_domains[:300]

    warnings: list[str] = []
    try:
        r = await client.post(TAVILY_URL, json=payload, timeout=settings.http_timeout_seconds)
        if r.status_code >= 400:
            logger.warning("Tavily HTTP %s: %s", r.status_code, r.text[:500])
            return [], [f"tavily_http_{r.status_code}"]
        data = r.json()
    except Exception as e:
        logger.warning("Tavily request failed: %s", e)
        return [], ["tavily_fetch_failed"]

    results = data.get("results") if isinstance(data, dict) else None
    if not isinstance(results, list):
        return [], ["tavily_empty"]

    out: list[dict[str, Any]] = []
    for row in results:
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or "").strip() or "(no title)"
        url = str(row.get("url") or "").strip()
        content = str(row.get("content") or row.get("snippet") or "").strip()
        if not url and not content:
            continue
        out.append({"title": title, "url": url, "snippet": content[:12000]})
    if not out:
        warnings.append("tavily_no_results")
    return out, warnings
