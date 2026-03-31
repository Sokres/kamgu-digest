"""Ежемесячный дайджест: ингест, дифф со снимком, LLM, сохранение снимка."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone

import httpx

from digest.config import settings
from digest.models import (
    DigestRequest,
    MonthlyDigestMeta,
    MonthlyDigestRequest,
    MonthlyDigestResponse,
    PublicationInput,
    SnapshotWorkRecord,
)
from digest.snapshot_store import (
    fetch_latest_snapshot_before,
    init_snapshot_schema,
    snapshot_connection,
    upsert_snapshot,
)
from pipeline.dedupe import dedupe_publications, publication_dedupe_key
from pipeline.llm import generate_monthly_digest_llm
from pipeline.monthly_diff import compute_monthly_structured_delta
from pipeline.score import rank_for_llm
from pipeline.run import (
    _english_search_fallback,
    _search_query,
)
from sources.openalex import fetch_openalex
from sources.semantic_scholar import fetch_semantic_scholar

logger = logging.getLogger(__name__)

SNAPSHOT_PAYLOAD_VERSION = 1


def _utc_period(force: str | None) -> str:
    if force:
        return force.strip()
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _ranked_to_snapshot_works(
    ranked: list[PublicationInput],
) -> list[SnapshotWorkRecord]:
    out: list[SnapshotWorkRecord] = []
    for i, p in enumerate(ranked):
        out.append(
            SnapshotWorkRecord(
                dedupe_key=publication_dedupe_key(p),
                title=p.title,
                year=p.year,
                doi=p.doi,
                openalex_work_id=p.openalex_work_id,
                citation_count=p.citation_count,
                rank=i + 1,
                concepts=list(p.concepts),
            )
        )
    return out


def _works_from_payload(payload: dict) -> list[SnapshotWorkRecord]:
    works = payload.get("works") if isinstance(payload, dict) else None
    if not works or not isinstance(works, list):
        return []
    out: list[SnapshotWorkRecord] = []
    for w in works:
        if isinstance(w, dict):
            try:
                out.append(SnapshotWorkRecord.model_validate(w))
            except Exception:
                logger.warning("Skipping invalid snapshot work row: %s", w.get("title"))
    return out


async def run_monthly_digest(req: MonthlyDigestRequest) -> MonthlyDigestResponse:
    t0 = time.perf_counter()
    period = _utc_period(req.force_period)
    digest_req = DigestRequest(
        topic_queries=req.topic_queries,
        max_candidates=req.max_candidates,
        top_n_for_llm=req.top_n_for_llm,
        from_year=req.from_year,
        to_year=req.to_year,
        exclude_dois=req.exclude_dois,
    )

    prev_works: list[SnapshotWorkRecord] | None = None
    compared_period: str | None = None
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        prev_row = fetch_latest_snapshot_before(conn, req.profile_id, period)
        if prev_row:
            compared_period, payload = prev_row
            prev_works = _works_from_payload(payload)

    meta_warnings: list[str] = []
    search = _search_query(digest_req.topic_queries)
    if settings.semantic_scholar_enabled:
        half = max(1, digest_req.max_candidates // 2)
        oa_limit = half
        ss_limit = max(1, digest_req.max_candidates - half)
    else:
        oa_limit = digest_req.max_candidates
        ss_limit = 0

    timeout = httpx.Timeout(settings.http_timeout_seconds)
    oa_kw = dict(
        peer_reviewed_only=digest_req.peer_reviewed_only,
        openalex_concept_id=digest_req.openalex_concept_id,
        openalex_source_ids=digest_req.openalex_source_ids,
    )
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=settings.http_client_headers(),
    ) as client:
        oa, w_oa = await fetch_openalex(
            client,
            search,
            oa_limit,
            digest_req.from_year,
            digest_req.to_year,
            **oa_kw,
        )
        meta_warnings.extend(w_oa)
        ss_query = search
        if len(oa) == 0:
            alt = _english_search_fallback(digest_req.topic_queries)
            if alt and alt.casefold() != search.casefold():
                logger.info("OpenAlex пусто — второй запрос (англ. фраза): %s", alt[:120])
                oa, w_oa2 = await fetch_openalex(
                    client,
                    alt,
                    oa_limit,
                    digest_req.from_year,
                    digest_req.to_year,
                    **oa_kw,
                )
                meta_warnings.extend(w_oa2)
                ss_query = alt
        if settings.semantic_scholar_enabled and ss_limit > 0:
            if settings.source_stagger_seconds > 0:
                await asyncio.sleep(settings.source_stagger_seconds)
            ss, w_ss = await fetch_semantic_scholar(
                client, ss_query, ss_limit, digest_req.from_year, digest_req.to_year
            )
            meta_warnings.extend(w_ss)
        else:
            ss = []

    raw: list[PublicationInput] = list(oa) + list(ss)
    exclude = set(digest_req.exclude_dois)
    deduped = dedupe_publications(raw, exclude)
    ranked = rank_for_llm(deduped, digest_req.topic_queries, digest_req.top_n_for_llm)

    logger.info(
        "Monthly ingest profile=%s period=%s: openalex=%s ss=%s deduped=%s ranked=%s",
        req.profile_id,
        period,
        len(oa),
        len(ss),
        len(deduped),
        len(ranked),
    )

    if not ranked:
        raise ValueError(
            "Не найдено публикаций для ежемесячного дайджеста: проверьте запрос и годы, "
            "либо источники (OpenAlex/Semantic Scholar)."
        )

    current_snapshot_rows = _ranked_to_snapshot_works(ranked)
    is_baseline = prev_works is None or len(prev_works) == 0
    structured = compute_monthly_structured_delta(
        profile_id=req.profile_id,
        current_period=period,
        compared_period=compared_period,
        is_baseline=is_baseline,
        previous_works=prev_works,
        current_works=current_snapshot_rows,
        trend_top_k=req.trend_top_k,
    )

    llm = await generate_monthly_digest_llm(
        ranked, req.topic_queries, structured
    )

    digest_ru = llm.digest_ru.strip()
    digest_en = llm.digest_en.strip()
    if llm.overview_ru and digest_ru and llm.overview_ru not in digest_ru:
        digest_ru = f"**Обзор:** {llm.overview_ru}\n\n{digest_ru}"
    if llm.overview_en and digest_en and llm.overview_en not in digest_en:
        digest_en = f"**Overview:** {llm.overview_en}\n\n{digest_en}"

    payload = {
        "version": SNAPSHOT_PAYLOAD_VERSION,
        "profile_id": req.profile_id,
        "period": period,
        "topic_queries": req.topic_queries,
        "works": [w.model_dump() for w in current_snapshot_rows],
    }
    snapshot_saved = False
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            upsert_snapshot(conn, req.profile_id, period, payload)
        snapshot_saved = True
    except Exception as e:
        logger.exception("Snapshot save failed: %s", e)
        meta_warnings.append(f"snapshot_save_failed:{e}")

    elapsed = time.perf_counter() - t0
    meta = MonthlyDigestMeta(
        digest_mode="peer_reviewed",
        candidates_openalex=len(oa),
        candidates_semantic_scholar=len(ss),
        after_dedupe=len(deduped),
        used_for_llm=len(ranked),
        elapsed_seconds=round(elapsed, 3),
        warnings=meta_warnings,
        profile_id=req.profile_id,
        period=period,
        compared_period=compared_period,
        snapshot_saved=snapshot_saved,
    )

    return MonthlyDigestResponse(
        publications_used=ranked,
        article_cards=llm.article_cards,
        digest_ru=digest_ru,
        digest_en=digest_en,
        structured_delta=structured,
        meta=meta,
    )
