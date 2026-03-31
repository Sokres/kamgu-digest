import asyncio
import logging
import time
import unicodedata

import httpx

from digest.config import settings
from digest.models import DigestMeta, DigestRequest, DigestResponse, PublicationInput
from pipeline.dedupe import dedupe_publications
from pipeline.llm import generate_digest_llm
from pipeline.score import rank_for_llm
from sources.openalex import fetch_openalex
from sources.semantic_scholar import fetch_semantic_scholar

logger = logging.getLogger(__name__)


def _search_query(topic_queries: list[str]) -> str:
    parts = [q.strip() for q in topic_queries if q.strip()]
    raw = " ".join(parts[:6])[:400]
    # NFC: иначе «ё» из macOS/браузера (NFD) даёт странный URL и OpenAlex часто возвращает 0 работ.
    return unicodedata.normalize("NFC", raw)


def _english_search_fallback(topic_queries: list[str]) -> str | None:
    """Если смешанный RU+EN запрос дал 0 работ в OpenAlex — пробуем отдельную EN-строку."""
    for q in topic_queries:
        q = unicodedata.normalize("NFC", (q or "").strip())
        if len(q) < 3:
            continue
        non_ascii = sum(1 for c in q if ord(c) > 127)
        if non_ascii * 2 < len(q):
            return q[:400]
    return None


async def run_digest(req: DigestRequest) -> DigestResponse:
    if req.digest_mode == "web_snippets":
        from pipeline.run_web import run_web_digest

        return await run_web_digest(req)

    t0 = time.perf_counter()
    search = _search_query(req.topic_queries)
    meta_warnings: list[str] = []
    if settings.semantic_scholar_enabled:
        half = max(1, req.max_candidates // 2)
        oa_limit = half
        ss_limit = max(1, req.max_candidates - half)
    else:
        oa_limit = req.max_candidates
        ss_limit = 0

    oa_kw = dict(
        peer_reviewed_only=req.peer_reviewed_only,
        openalex_concept_id=req.openalex_concept_id,
        openalex_source_ids=req.openalex_source_ids,
    )

    timeout = httpx.Timeout(settings.http_timeout_seconds)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=settings.http_client_headers(),
    ) as client:
        oa, w_oa = await fetch_openalex(
            client,
            search,
            oa_limit,
            req.from_year,
            req.to_year,
            **oa_kw,
        )
        meta_warnings.extend(w_oa)
        ss_query = search
        if len(oa) == 0:
            alt = _english_search_fallback(req.topic_queries)
            if alt and alt.casefold() != search.casefold():
                logger.info("OpenAlex пусто — второй запрос (англ. фраза): %s", alt[:120])
                oa, w_oa2 = await fetch_openalex(
                    client,
                    alt,
                    oa_limit,
                    req.from_year,
                    req.to_year,
                    **oa_kw,
                )
                meta_warnings.extend(w_oa2)
                # Первый общий запрос дал 0 — для SS используем ту же EN-строку, что и для второго OA.
                ss_query = alt
        if settings.semantic_scholar_enabled and ss_limit > 0:
            if settings.source_stagger_seconds > 0:
                await asyncio.sleep(settings.source_stagger_seconds)
            ss, w_ss = await fetch_semantic_scholar(
                client, ss_query, ss_limit, req.from_year, req.to_year
            )
            meta_warnings.extend(w_ss)
        else:
            ss = []

    raw: list[PublicationInput] = list(oa) + list(ss)
    exclude = set(req.exclude_dois)
    deduped = dedupe_publications(raw, exclude)
    ranked = rank_for_llm(deduped, req.topic_queries, req.top_n_for_llm)

    logger.info(
        "Ingest: openalex=%s semantic_scholar=%s deduped=%s ranked_for_llm=%s",
        len(oa),
        len(ss),
        len(deduped),
        len(ranked),
    )

    if not ranked:
        logger.warning(
            "LLM/OpenRouter не вызывается: нет ни одной статьи после отбора "
            "(часто SS=429 и пустой OpenAlex на этом запросе)."
        )
        raise ValueError(
            "Не найдено публикаций: пустой OpenAlex на этом запросе, Semantic Scholar 403/429/пусто, "
            "или фильтр по годам/типу (type:article) и концептам. Для 403 у SS задайте OPENALEX_MAILTO или "
            "HTTP_USER_AGENT и/или SEMANTIC_SCHOLAR_API_KEY. Либо SEMANTIC_SCHOLAR_ENABLED=false и больший max_candidates, "
            "либо peer_reviewed_only=false."
        )

    llm = await generate_digest_llm(ranked, req.topic_queries)

    digest_ru = llm.digest_ru.strip()
    digest_en = llm.digest_en.strip()
    if llm.overview_ru and digest_ru and llm.overview_ru not in digest_ru:
        digest_ru = f"**Обзор:** {llm.overview_ru}\n\n{digest_ru}"
    if llm.overview_en and digest_en and llm.overview_en not in digest_en:
        digest_en = f"**Overview:** {llm.overview_en}\n\n{digest_en}"

    elapsed = time.perf_counter() - t0
    meta = DigestMeta(
        digest_mode="peer_reviewed",
        candidates_openalex=len(oa),
        candidates_semantic_scholar=len(ss),
        after_dedupe=len(deduped),
        used_for_llm=len(ranked),
        elapsed_seconds=round(elapsed, 3),
        warnings=meta_warnings,
    )
    logger.info("digest done %s", meta.model_dump())

    return DigestResponse(
        publications_used=ranked,
        article_cards=llm.article_cards,
        digest_ru=digest_ru,
        digest_en=digest_en,
        meta=meta,
    )
