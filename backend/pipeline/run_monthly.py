"""Ежемесячный дайджест: ингест, дифф со снимком, LLM, сохранение снимка."""

from __future__ import annotations

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
from pipeline.ingest_sources import ingest_peer_reviewed_sources
from sources.oa_fulltext import enrich_publications_with_oa_fulltext

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


async def run_monthly_digest(req: MonthlyDigestRequest, user_id: str) -> MonthlyDigestResponse:
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
        prev_row = fetch_latest_snapshot_before(conn, user_id, req.profile_id, period)
        if prev_row:
            compared_period, payload = prev_row
            prev_works = _works_from_payload(payload)

    meta_warnings: list[str] = []

    timeout = httpx.Timeout(settings.http_timeout_seconds)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=settings.http_client_headers(),
    ) as client:
        ing = await ingest_peer_reviewed_sources(
            client,
            topic_queries=digest_req.topic_queries,
            max_candidates=digest_req.max_candidates,
            from_year=digest_req.from_year,
            to_year=digest_req.to_year,
            peer_reviewed_only=digest_req.peer_reviewed_only,
            openalex_concept_id=digest_req.openalex_concept_id,
            openalex_source_ids=digest_req.openalex_source_ids,
        )
        meta_warnings.extend(ing.warnings)
        oa_count = ing.n_openalex
        ss_count = ing.n_semantic_scholar
        core_count = ing.n_core
        cr_dois = ing.crossref_enriched_dois

    raw: list[PublicationInput] = list(ing.publications)
    exclude = set(digest_req.exclude_dois)
    deduped = dedupe_publications(raw, exclude)
    ranked = rank_for_llm(deduped, digest_req.topic_queries, digest_req.top_n_for_llm)

    oa_n = 0
    if req.fetch_oa_fulltext and ranked:
        oa_timeout = httpx.Timeout(max(float(settings.http_timeout_seconds), 120.0))
        async with httpx.AsyncClient(
            timeout=oa_timeout,
            headers=settings.http_client_headers(),
        ) as oa_client:
            ranked, oa_warn, oa_n = await enrich_publications_with_oa_fulltext(oa_client, ranked)
            meta_warnings.extend(oa_warn)

    logger.info(
        "Monthly ingest profile=%s period=%s: openalex=%s ss=%s core=%s crossref_dois=%s deduped=%s ranked=%s",
        req.profile_id,
        period,
        oa_count,
        ss_count,
        core_count,
        cr_dois,
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

    llm, two_stage = await generate_monthly_digest_llm(
        ranked, req.topic_queries, structured, force_two_stage=req.deep_digest
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
            upsert_snapshot(conn, user_id, req.profile_id, period, payload)
        snapshot_saved = True
    except Exception as e:
        logger.exception("Snapshot save failed: %s", e)
        meta_warnings.append(f"snapshot_save_failed:{e}")

    elapsed = time.perf_counter() - t0
    meta = MonthlyDigestMeta(
        digest_mode="peer_reviewed",
        candidates_openalex=oa_count,
        candidates_semantic_scholar=ss_count,
        candidates_core=core_count,
        crossref_enriched_dois=cr_dois,
        after_dedupe=len(deduped),
        used_for_llm=len(ranked),
        elapsed_seconds=round(elapsed, 3),
        warnings=meta_warnings,
        profile_id=req.profile_id,
        period=period,
        compared_period=compared_period,
        snapshot_saved=snapshot_saved,
        oa_fulltext_fetched=oa_n,
        two_stage_llm=two_stage,
    )

    return MonthlyDigestResponse(
        publications_used=ranked,
        article_cards=llm.article_cards,
        digest_ru=digest_ru,
        digest_en=digest_en,
        structured_delta=structured,
        meta=meta,
    )
