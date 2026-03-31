import asyncio
import logging

import httpx

from digest.config import settings
from digest.models import PublicationInput
from sources.http_helpers import get_json

logger = logging.getLogger(__name__)

SS_SEARCH = "https://api.semanticscholar.org/graph/v1/paper/search"


def _paper_to_publication(p: dict) -> PublicationInput | None:
    title = (p.get("title") or "").strip()
    if not title:
        return None
    year = p.get("year")
    if year is not None:
        try:
            year = int(year)
        except (TypeError, ValueError):
            year = None
    ext = p.get("externalIds") or {}
    doi = (ext.get("DOI") or "").strip() or None
    url = (p.get("url") or "").strip()
    if not url and doi:
        url = f"https://doi.org/{doi}"
    abstract = (p.get("abstract") or "").strip()
    cc = p.get("citationCount")
    try:
        citation_count = int(cc) if cc is not None else None
    except (TypeError, ValueError):
        citation_count = None
    return PublicationInput(
        title=title,
        abstract=abstract,
        year=year,
        url=url,
        doi=doi,
        source="semantic_scholar",
        citation_count=citation_count,
    )


async def fetch_semantic_scholar(
    client: httpx.AsyncClient,
    search_query: str,
    limit: int,
    from_year: int | None,
    to_year: int | None,
) -> tuple[list[PublicationInput], list[str]]:
    if not settings.semantic_scholar_enabled:
        logger.info("Semantic Scholar disabled (SEMANTIC_SCHOLAR_ENABLED=false)")
        return [], []
    if limit <= 0:
        return [], []
    fields = "title,year,abstract,url,externalIds,citationCount"
    out: list[PublicationInput] = []
    offset = 0
    # Меньший размер страницы — мягче для лимитов бесплатного API.
    page_size = min(25, max(1, limit))
    ss_headers: dict[str, str] = {}
    key = (settings.semantic_scholar_api_key or "").strip()
    if key:
        ss_headers["x-api-key"] = key
    try:
        while len(out) < limit:
            if offset > 0 and settings.semantic_scholar_page_delay_seconds > 0:
                await asyncio.sleep(settings.semantic_scholar_page_delay_seconds)
            data = await get_json(
                client,
                SS_SEARCH,
                params={
                    "query": search_query,
                    "limit": page_size,
                    "offset": offset,
                    "fields": fields,
                },
                headers=ss_headers or None,
                max_attempts=settings.semantic_scholar_max_retries,
            )
            if not data:
                break
            papers = data.get("data") or []
            if not papers:
                break
            for p in papers:
                pub = _paper_to_publication(p)
                if pub:
                    if from_year is not None and pub.year is not None and pub.year < from_year:
                        continue
                    if to_year is not None and pub.year is not None and pub.year > to_year:
                        continue
                    out.append(pub)
                if len(out) >= limit:
                    break
            offset += len(papers)
            if len(papers) < page_size:
                break
            if offset > 500:
                break
    except Exception as e:
        logger.warning("Semantic Scholar fetch failed: %s", e)
        return [], ["semantic_scholar_fetch_failed"]
    return out[:limit], []
