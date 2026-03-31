"""Web snippet digest pipeline (Tavily + LLM)."""

from __future__ import annotations

import logging
import time

import httpx

from digest.config import settings
from digest.models import DigestMeta, DigestRequest, DigestResponse, PublicationInput
from pipeline.llm import generate_web_digest_llm
from pipeline.run import _search_query
from sources.tavily import (
    build_tavily_query,
    fetch_tavily_snippets,
    resolve_scholarly_include_domains,
)

logger = logging.getLogger(__name__)

FIXED_DISCLAIMER_RU = (
    "**Дисклеймер:** обзор по веб-сниппетам (Tavily), не рецензируемый корпус и не систематический обзор литературы.\n\n"
)
FIXED_DISCLAIMER_EN = (
    "**Disclaimer:** based on web search snippets (Tavily), not a peer-reviewed corpus or systematic review.\n\n"
)


async def run_web_digest(req: DigestRequest) -> DigestResponse:
    if not (settings.tavily_api_key or "").strip():
        raise ValueError(
            "Веб-обзор: укажите TAVILY_API_KEY в .env (https://tavily.com)."
        )

    t0 = time.perf_counter()
    base_search = _search_query(req.topic_queries)
    tavily_query = build_tavily_query(base_search, req.web_search_additional_terms)
    include_domains: list[str] | None = None
    if req.web_scholarly_sources_only:
        include_domains = resolve_scholarly_include_domains()

    meta_warnings: list[str] = []
    if req.web_scholarly_sources_only and include_domains:
        meta_warnings.append("tavily_include_domains_scholarly")
    max_snip = min(req.top_n_for_llm, settings.web_search_max_results, 20)

    timeout = httpx.Timeout(settings.http_timeout_seconds)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=settings.http_client_headers(),
    ) as client:
        snippets_raw, w = await fetch_tavily_snippets(
            client,
            tavily_query,
            max_snip,
            include_domains=include_domains,
        )
        meta_warnings.extend(w)

    if not snippets_raw:
        raise ValueError(
            "Веб-обзор: пустой ответ поиска (запрос, ключ Tavily, лимиты). "
            "Если включён поиск только по научным доменам — попробуйте добавить ключевые слова (web_search_additional_terms), "
            "ослабить запрос или временно выключить web_scholarly_sources_only (весь интернет)."
        )

    pubs = [
        PublicationInput(
            title=s["title"],
            abstract=s["snippet"],
            url=s.get("url") or "",
            source="web_snippet",
        )
        for s in snippets_raw
    ]

    llm = await generate_web_digest_llm(snippets_raw, req.topic_queries)

    digest_ru = llm.digest_ru.strip()
    digest_en = llm.digest_en.strip()
    if llm.overview_ru and digest_ru and llm.overview_ru not in digest_ru:
        digest_ru = f"**Обзор:** {llm.overview_ru}\n\n{digest_ru}"
    if llm.overview_en and digest_en and llm.overview_en not in digest_en:
        digest_en = f"**Overview:** {llm.overview_en}\n\n{digest_en}"
    if FIXED_DISCLAIMER_RU.strip() not in digest_ru:
        digest_ru = FIXED_DISCLAIMER_RU + digest_ru
    if FIXED_DISCLAIMER_EN.strip() not in digest_en:
        digest_en = FIXED_DISCLAIMER_EN + digest_en

    elapsed = time.perf_counter() - t0
    meta = DigestMeta(
        digest_mode="web_snippets",
        candidates_openalex=0,
        candidates_semantic_scholar=0,
        web_snippets_used=len(snippets_raw),
        web_scholarly_domain_filter=bool(req.web_scholarly_sources_only and include_domains),
        after_dedupe=len(pubs),
        used_for_llm=len(pubs),
        elapsed_seconds=round(elapsed, 3),
        warnings=meta_warnings,
    )
    logger.info("web digest done %s", meta.model_dump())

    return DigestResponse(
        publications_used=pubs,
        article_cards=llm.article_cards,
        digest_ru=digest_ru,
        digest_en=digest_en,
        meta=meta,
    )
