"""CORE API v3: POST /v3/search/works — см. https://api.core.ac.uk/docs/v3"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import httpx

from digest.config import settings
from digest.models import PublicationInput
from sources.http_helpers import post_json

logger = logging.getLogger(__name__)

CORE_SEARCH_WORKS = "https://api.core.ac.uk/v3/search/works"


def _build_core_q(
    search_query: str,
    from_year: int | None,
    to_year: int | None,
) -> str:
    parts: list[str] = []
    q = (search_query or "").strip()
    if q:
        parts.append(q)
    if from_year is not None or to_year is not None:
        y0 = from_year if from_year is not None else 1789
        y1 = to_year if to_year is not None else datetime.now().year
        parts.append(f"(yearPublished>={y0} AND yearPublished<={y1})")
    return " AND ".join(parts) if parts else "yearPublished>=1900"


def _item_to_publication(item: dict) -> PublicationInput | None:
    if not isinstance(item, dict):
        return None
    title = (item.get("title") or "").strip()
    if not title:
        return None
    year = item.get("yearPublished")
    if year is not None:
        try:
            year = int(year)
        except (TypeError, ValueError):
            year = None
    doi_raw = item.get("doi") or item.get("DOI") or ""
    doi = str(doi_raw).strip().lower().replace("https://doi.org/", "") or None

    url = (
        (item.get("downloadUrl") or item.get("sourceFulltextUrl") or item.get("fullTextDownloadUrl") or "")
        .strip()
    )
    if not url and doi:
        url = f"https://doi.org/{doi}"

    abstract = (item.get("abstract") or item.get("abstractText") or "").strip()
    return PublicationInput(
        title=title,
        abstract=abstract,
        year=year,
        url=url,
        doi=doi,
        source="core",
        citation_count=None,
    )


async def fetch_core(
    client: httpx.AsyncClient,
    search_query: str,
    limit: int,
    from_year: int | None,
    to_year: int | None,
) -> tuple[list[PublicationInput], list[str]]:
    key = (settings.core_api_key or "").strip()
    if not settings.core_enabled or not key:
        return [], []
    if limit <= 0:
        return [], []

    q = _build_core_q(search_query, from_year, to_year)
    headers = {"Authorization": f"Bearer {key}"}
    out: list[PublicationInput] = []
    offset = 0
    page = 0

    try:
        while len(out) < limit and page < settings.core_max_pages:
            if page > 0:
                await asyncio.sleep(settings.core_request_delay_seconds)
            page_size = min(100, limit - len(out))
            body: dict = {"q": q, "limit": page_size, "offset": offset}
            data = await post_json(
                client,
                CORE_SEARCH_WORKS,
                json_body=body,
                headers=headers,
                max_attempts=settings.http_max_retries,
            )
            if not data:
                return out, ["core_fetch_failed"] if not out else []
            results = data.get("results")
            if not isinstance(results, list):
                break
            if not results:
                break
            for it in results:
                pub = _item_to_publication(it)
                if pub:
                    if from_year is not None and pub.year is not None and pub.year < from_year:
                        continue
                    if to_year is not None and pub.year is not None and pub.year > to_year:
                        continue
                    out.append(pub)
                if len(out) >= limit:
                    break
            offset += len(results)
            page += 1
            if len(results) < page_size:
                break
    except Exception as e:
        logger.warning("CORE fetch failed: %s", e)
        return [], ["core_fetch_failed"]

    return out[:limit], []
