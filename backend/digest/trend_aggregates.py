"""Агрегация highlights и эволюции концептов из сохранённых снимков."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from psycopg import Connection as PgConnection

from digest.models import (
    MonthlyStructuredDelta,
    SnapshotWorkRecord,
    TrendCitationGainHighlight,
    TrendConceptEvolutionPoint,
    TrendConceptShiftHighlight,
    TrendHighlightsResponse,
    TrendLatestSnapshotSummary,
    TrendPeriodHighlight,
)
from pipeline.monthly_diff import aggregate_concept_shares


def _parse_payload(raw_payload: str | dict[str, Any]) -> dict[str, Any]:
    try:
        payload = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _works_from_payload(payload: dict[str, Any]) -> list[SnapshotWorkRecord]:
    works_raw = payload.get("works")
    if not isinstance(works_raw, list):
        return []
    out: list[SnapshotWorkRecord] = []
    for w in works_raw:
        if isinstance(w, dict):
            try:
                out.append(SnapshotWorkRecord.model_validate(w))
            except Exception:
                continue
    return out


def _structured_from_payload(payload: dict[str, Any]) -> MonthlyStructuredDelta | None:
    sd_raw = payload.get("structured_delta")
    if not isinstance(sd_raw, dict):
        return None
    try:
        return MonthlyStructuredDelta.model_validate(sd_raw)
    except Exception:
        return None


def _top_citation_gain(
    structured: MonthlyStructuredDelta | None,
) -> TrendCitationGainHighlight | None:
    if structured is None or structured.is_baseline:
        return None
    rows = structured.top_by_citation_gain or []
    for row in rows:
        if row.citation_delta is not None and row.citation_delta != 0:
            return TrendCitationGainHighlight(title=row.title, delta=row.citation_delta)
    return None


def _top_concept_shift(
    structured: MonthlyStructuredDelta | None,
) -> TrendConceptShiftHighlight | None:
    if structured is None or structured.is_baseline:
        return None
    rows = structured.concept_share_deltas or []
    for row in rows:
        if row.delta is not None and abs(row.delta) > 0.0001:
            return TrendConceptShiftHighlight(name=row.concept_name, delta=row.delta)
    return None


def _top_concept_shares(shares: dict[str, float], limit: int = 5) -> dict[str, float]:
    ranked = sorted(shares.items(), key=lambda x: x[1], reverse=True)[:limit]
    return {name: round(share, 4) for name, share in ranked}


def build_trend_highlights(
    profile_id: str,
    rows: list[tuple[str, str, str | dict[str, Any]]],
) -> TrendHighlightsResponse:
    points: list[TrendPeriodHighlight] = []
    concept_evolution: list[TrendConceptEvolutionPoint] = []
    latest_snapshot: TrendLatestSnapshotSummary | None = None
    topic_queries: list[str] = []

    for period, created_at, raw_payload in rows:
        payload = _parse_payload(raw_payload)
        raw_tq = payload.get("topic_queries")
        if isinstance(raw_tq, list):
            tq = [str(x).strip() for x in raw_tq if str(x).strip()]
            if tq:
                topic_queries = tq
        works = _works_from_payload(payload)
        work_count = len(works)
        structured = _structured_from_payload(payload)

        digest_ru = str(payload.get("digest_ru") or "").strip()
        digest_en = str(payload.get("digest_en") or "").strip()
        digest_available = bool(digest_ru or digest_en)

        shares = aggregate_concept_shares(works)
        if shares:
            concept_evolution.append(
                TrendConceptEvolutionPoint(period=period, shares=_top_concept_shares(shares))
            )

        is_baseline = structured.is_baseline if structured else True
        compared_period = structured.compared_period if structured else None
        entered_count = len(structured.entered_top_k) if structured and not is_baseline else 0
        left_count = len(structured.left_top_k) if structured and not is_baseline else 0

        points.append(
            TrendPeriodHighlight(
                period=period,
                created_at=created_at,
                work_count=work_count,
                is_baseline=is_baseline,
                compared_period=compared_period,
                entered_count=entered_count,
                left_count=left_count,
                top_citation_gain=_top_citation_gain(structured),
                top_concept_shift=_top_concept_shift(structured),
            )
        )

        latest_snapshot = TrendLatestSnapshotSummary(
            period=period,
            created_at=created_at,
            digest_available=digest_available,
            digest_ru=digest_ru,
            digest_en=digest_en,
            structured_delta=structured,
        )

    return TrendHighlightsResponse(
        profile_id=profile_id,
        topic_queries=topic_queries,
        points=points,
        latest_snapshot=latest_snapshot,
        concept_evolution=concept_evolution,
    )


def list_snapshot_rows_for_profile(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
) -> list[tuple[str, str, str | dict[str, Any]]]:
    from digest.snapshot_store import _backend_of_conn, _ph

    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT period, created_at, payload_json FROM digest_snapshots
        WHERE user_id = {ph} AND profile_id = {ph}
        ORDER BY period ASC
    """
    cur = conn.execute(sql, (user_id, profile_id))
    return [(str(r[0]), str(r[1]), r[2]) for r in cur.fetchall()]
