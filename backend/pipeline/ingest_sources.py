"""Сбор кандидатов из OpenAlex, Semantic Scholar, CORE и обогащение Crossref."""

from __future__ import annotations

import asyncio
import logging
import unicodedata
from dataclasses import dataclass

import httpx

from digest.config import settings
from digest.models import PublicationInput
from sources.core import fetch_core
from sources.crossref import enrich_publications_crossref
from sources.openalex import fetch_openalex
from sources.semantic_scholar import fetch_semantic_scholar

logger = logging.getLogger(__name__)


def search_query(topic_queries: list[str]) -> str:
    parts = [q.strip() for q in topic_queries if q.strip()]
    raw = " ".join(parts[:6])[:400]
    return unicodedata.normalize("NFC", raw)


def english_search_fallback(topic_queries: list[str]) -> str | None:
    """Если смешанный RU+EN запрос дал 0 работ в OpenAlex — пробуем отдельную EN-строку."""
    for q in topic_queries:
        q = unicodedata.normalize("NFC", (q or "").strip())
        if len(q) < 3:
            continue
        non_ascii = sum(1 for c in q if ord(c) > 127)
        if non_ascii * 2 < len(q):
            return q[:400]
    return None


@dataclass(frozen=True)
class PeerReviewedIngest:
    publications: list[PublicationInput]
    warnings: list[str]
    n_openalex: int
    n_semantic_scholar: int
    n_core: int
    crossref_enriched_dois: int


def _compute_source_limits(max_candidates: int) -> tuple[int, int, int]:
    """Возвращает лимиты (oa, ss, core)."""
    ss_on = settings.semantic_scholar_enabled
    core_on = settings.core_enabled and bool((settings.core_api_key or "").strip())
    if ss_on and core_on:
        third = max(1, max_candidates // 3)
        oa = third
        ss = third
        core = max(1, max_candidates - oa - ss)
    elif ss_on:
        half = max(1, max_candidates // 2)
        oa = half
        ss = max(1, max_candidates - half)
        core = 0
    elif core_on:
        half = max(1, max_candidates // 2)
        oa = half
        core = max(1, max_candidates - half)
        ss = 0
    else:
        oa = max_candidates
        ss = 0
        core = 0
    return oa, ss, core


async def ingest_peer_reviewed_sources(
    client: httpx.AsyncClient,
    *,
    topic_queries: list[str],
    max_candidates: int,
    from_year: int | None,
    to_year: int | None,
    peer_reviewed_only: bool = True,
    openalex_concept_id: str | None = None,
    openalex_source_ids: list[str] | None = None,
) -> PeerReviewedIngest:
    meta_warnings: list[str] = []
    oa_limit, ss_limit, core_limit = _compute_source_limits(max_candidates)

    oa_kw = dict(
        peer_reviewed_only=peer_reviewed_only,
        openalex_concept_id=openalex_concept_id,
        openalex_source_ids=list(openalex_source_ids or []),
    )

    search = search_query(topic_queries)
    oa, w_oa = await fetch_openalex(
        client,
        search,
        oa_limit,
        from_year,
        to_year,
        **oa_kw,
    )
    meta_warnings.extend(w_oa)
    ss_query = search
    if len(oa) == 0:
        alt = english_search_fallback(topic_queries)
        if alt and alt.casefold() != search.casefold():
            logger.info("OpenAlex пусто — второй запрос (англ. фраза): %s", alt[:120])
            oa, w_oa2 = await fetch_openalex(
                client,
                alt,
                oa_limit,
                from_year,
                to_year,
                **oa_kw,
            )
            meta_warnings.extend(w_oa2)
            ss_query = unicodedata.normalize("NFC", alt)

    if settings.semantic_scholar_enabled and ss_limit > 0:
        if settings.source_stagger_seconds > 0:
            await asyncio.sleep(settings.source_stagger_seconds)
        ss, w_ss = await fetch_semantic_scholar(
            client, ss_query, ss_limit, from_year, to_year
        )
        meta_warnings.extend(w_ss)
    else:
        ss = []

    if core_limit > 0:
        if settings.core_request_delay_seconds > 0:
            await asyncio.sleep(settings.core_request_delay_seconds)
        core, w_core = await fetch_core(
            client, ss_query, core_limit, from_year, to_year
        )
        meta_warnings.extend(w_core)
    else:
        core = []

    raw: list[PublicationInput] = list(oa) + list(ss) + list(core)
    raw, w_cr, n_cr = await enrich_publications_crossref(client, raw)
    meta_warnings.extend(w_cr)

    return PeerReviewedIngest(
        publications=raw,
        warnings=meta_warnings,
        n_openalex=len(oa),
        n_semantic_scholar=len(ss),
        n_core=len(core),
        crossref_enriched_dois=n_cr,
    )
