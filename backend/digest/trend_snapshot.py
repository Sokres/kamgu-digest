"""Сборка TrendSnapshotDetail из payload_json снимка."""

from __future__ import annotations

from typing import Any

from digest.models import (
    ArticleCard,
    MonthlyDigestMeta,
    MonthlyStructuredDelta,
    PublicationInput,
    SnapshotWorkRecord,
    TrendSnapshotDetail,
)


def payload_to_trend_snapshot_detail(
    profile_id: str,
    period: str,
    created_at: str,
    payload: dict[str, Any],
) -> TrendSnapshotDetail:
    raw_tq = payload.get("topic_queries")
    if isinstance(raw_tq, list):
        topic_queries = [str(x).strip() for x in raw_tq if str(x).strip()]
    else:
        topic_queries = []

    works_raw = payload.get("works")
    works: list[SnapshotWorkRecord] = []
    if isinstance(works_raw, list):
        for w in works_raw:
            if isinstance(w, dict):
                try:
                    works.append(SnapshotWorkRecord.model_validate(w))
                except Exception:
                    continue

    work_count = len(works) if works else (
        len(works_raw) if isinstance(works_raw, list) else 0
    )

    digest_ru = str(payload.get("digest_ru") or "").strip()
    digest_en = str(payload.get("digest_en") or "").strip()
    digest_available = bool(digest_ru or digest_en)

    publications: list[PublicationInput] = []
    pub_raw = payload.get("publications_used")
    if isinstance(pub_raw, list):
        for p in pub_raw:
            if isinstance(p, dict):
                try:
                    publications.append(PublicationInput.model_validate(p))
                except Exception:
                    continue

    cards: list[ArticleCard] = []
    cards_raw = payload.get("article_cards")
    if isinstance(cards_raw, list):
        for c in cards_raw:
            if isinstance(c, dict):
                try:
                    cards.append(ArticleCard.model_validate(c))
                except Exception:
                    continue

    structured: MonthlyStructuredDelta | None = None
    sd_raw = payload.get("structured_delta")
    if isinstance(sd_raw, dict):
        try:
            structured = MonthlyStructuredDelta.model_validate(sd_raw)
        except Exception:
            structured = None

    meta: MonthlyDigestMeta | None = None
    meta_raw = payload.get("meta")
    if isinstance(meta_raw, dict):
        try:
            meta = MonthlyDigestMeta.model_validate(meta_raw)
        except Exception:
            meta = None

    return TrendSnapshotDetail(
        profile_id=profile_id,
        period=period,
        created_at=created_at,
        topic_queries=topic_queries,
        work_count=work_count,
        digest_available=digest_available,
        digest_ru=digest_ru,
        digest_en=digest_en,
        publications_used=publications,
        article_cards=cards,
        structured_delta=structured,
        meta=meta,
        works=works,
    )
