"""Обогащение метаданных по DOI через Crossref REST API (GET /works/{doi})."""

from __future__ import annotations

import logging
import re
from urllib.parse import quote

import httpx

from digest.config import settings
from digest.models import PublicationInput
from sources.http_helpers import get_json

logger = logging.getLogger(__name__)

_CROSSREF_TAG = re.compile(r"<[^>]+>")


def _normalize_doi(d: str | None) -> str | None:
    if not d:
        return None
    x = d.strip().lower().replace("https://doi.org/", "").strip()
    return x or None


def _strip_abstract(raw: str) -> str:
    s = _CROSSREF_TAG.sub(" ", raw)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _title_from_message(msg: dict) -> str:
    t = msg.get("title")
    if isinstance(t, list) and t:
        return str(t[0]).strip()
    if isinstance(t, str):
        return t.strip()
    st = msg.get("short-title")
    if isinstance(st, list) and st:
        return str(st[0]).strip()
    return ""


def _year_from_message(msg: dict) -> int | None:
    for key in ("issued", "published-print", "published-online", "created"):
        part = msg.get(key)
        if isinstance(part, dict):
            dp = part.get("date-parts")
            if isinstance(dp, list) and dp and isinstance(dp[0], list) and dp[0]:
                try:
                    y = int(dp[0][0])
                    if 1000 <= y <= 2100:
                        return y
                except (TypeError, ValueError):
                    pass
    return None


def _merge_crossref(pub: PublicationInput, msg: dict, doi_norm: str) -> PublicationInput:
    ct = _title_from_message(msg)
    title = pub.title
    if ct and (not title.strip() or len(ct) > len(title)):
        title = ct

    ab_raw = (msg.get("abstract") or "").strip()
    ab = _strip_abstract(ab_raw) if ab_raw else ""
    abstract = pub.abstract or ""
    if len(ab) > len(abstract):
        abstract = ab

    year = pub.year if pub.year is not None else _year_from_message(msg)

    url = (pub.url or "").strip()
    if not url and doi_norm:
        url = f"https://doi.org/{doi_norm}"

    cite = pub.citation_count
    crc = msg.get("is-referenced-by-count")
    if cite is None and crc is not None:
        try:
            cite = int(crc)
        except (TypeError, ValueError):
            cite = pub.citation_count

    return pub.model_copy(
        update={
            "title": title,
            "abstract": abstract,
            "year": year,
            "url": url,
            "citation_count": cite,
        }
    )


async def enrich_publications_crossref(
    client: httpx.AsyncClient,
    publications: list[PublicationInput],
) -> tuple[list[PublicationInput], list[str], int]:
    """
    Для уникальных DOI (до crossref_max_unique_dois) подтягивает метаданные Crossref
    и сливает в записи (длиннее abstract/title приоритетнее).
    """
    if not settings.crossref_enrichment_enabled:
        return publications, [], 0

    uniq: list[str] = []
    seen: set[str] = set()
    for p in publications:
        nd = _normalize_doi(p.doi)
        if nd and nd not in seen:
            seen.add(nd)
            uniq.append(nd)
    uniq = uniq[: settings.crossref_max_unique_dois]

    cache: dict[str, dict] = {}
    warnings: list[str] = []
    for doi in uniq:
        path = quote(doi, safe="")
        url = f"https://api.crossref.org/works/{path}"
        data = await get_json(client, url, max_attempts=settings.http_max_retries)
        if not data:
            continue
        msg = data.get("message")
        if isinstance(msg, dict):
            cache[doi] = msg
        else:
            warnings.append("crossref_bad_message")

    if not cache:
        return publications, warnings, 0

    out: list[PublicationInput] = []
    for p in publications:
        nd = _normalize_doi(p.doi)
        if nd and nd in cache:
            out.append(_merge_crossref(p, cache[nd], nd))
        else:
            out.append(p)

    logger.info("Crossref enrichment: %s unique DOI merged", len(cache))
    return out, warnings, len(cache)
