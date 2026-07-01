import logging
import sqlite3

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query, Response

from digest.period_utils import validate_snapshot_period_label

from app.services.digest_http import effective_llm_api_key
from digest.config import settings
from digest.models import (
    DigestProfileCreate,
    DigestProfileCreated,
    TrendAnalysisResponse,
    TrendHighlightsResponse,
    TrendProfileLabelUpdate,
    TrendProfileSummary,
    TrendSeriesPoint,
    TrendSeriesResponse,
    TrendSnapshotDetail,
)
from digest.snapshot_store import (
    delete_digest_profile,
    delete_trend_analysis_cache,
    digest_profile_exists_for_user,
    fetch_profile_display_name,
    fetch_snapshot_for_period,
    get_trend_analysis_cache,
    init_snapshot_schema,
    insert_digest_profile,
    list_period_metrics_for_profile,
    list_profile_summaries,
    upsert_profile_label,
    upsert_trend_analysis_cache,
    snapshot_connection,
)
from digest.trend_aggregates import build_trend_highlights, list_snapshot_rows_for_profile
from digest.trend_snapshot import payload_to_trend_snapshot_detail
from pipeline.llm import generate_trend_series_analysis_llm
from app.api.deps import auth_legacy_user_id, resolve_periodic_user_id, resolve_trends_reader_user_id

logger = logging.getLogger(__name__)

router = APIRouter(tags=["trends"])

_DB_UNAVAILABLE = (
    "База снимков недоступна (проверьте SNAPSHOT_DATABASE_URL). "
    "Без Docker: SNAPSHOT_DATABASE_URL=sqlite:///./snapshots.db в backend/.env"
)


def _snapshot_http_exc(exc: Exception) -> HTTPException:
    logger.warning("snapshot DB error: %s", exc)
    return HTTPException(status_code=503, detail=_DB_UNAVAILABLE)


def _validate_period(period: str) -> str:
    try:
        return validate_snapshot_period_label(period)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="period должен быть в формате YYYY-MM или YYYY-MM-DD.",
        ) from None


@router.post("/trends/profiles", response_model=DigestProfileCreated)
def create_trends_profile(
    body: DigestProfileCreate,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> DigestProfileCreated:
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            pid, created_at = insert_digest_profile(
                conn, uid, body.display_name, body.note or None
            )
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    return DigestProfileCreated(
        profile_id=pid,
        display_name=body.display_name.strip(),
        note=(body.note or "").strip(),
        created_at=created_at,
    )


@router.get("/trends/profiles", response_model=list[TrendProfileSummary])
def list_trends_profiles(
    authorization: str | None = Header(None),
) -> list[TrendProfileSummary]:
    read_uid = resolve_trends_reader_user_id(authorization)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            rows = list_profile_summaries(conn, user_id=read_uid)
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    return [TrendProfileSummary.model_validate(r) for r in rows]


@router.get("/trends/profiles/{profile_id}/series", response_model=TrendSeriesResponse)
def get_trends_series(
    profile_id: str,
    authorization: str | None = Header(None),
    user_id: str | None = Query(
        None,
        description="Владелец профиля (если без AUTH: из списка /trends/profiles; иначе из токена).",
    ),
) -> TrendSeriesResponse:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    read_uid = resolve_trends_reader_user_id(authorization)
    tenant = read_uid if read_uid is not None else ((user_id or "").strip() or auth_legacy_user_id())
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if not digest_profile_exists_for_user(conn, tenant, pid):
                raise HTTPException(
                    status_code=404,
                    detail="Профиль не найден или нет доступа.",
                )
            points_raw = list_period_metrics_for_profile(conn, tenant, pid)
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    points = [TrendSeriesPoint.model_validate(p) for p in points_raw]
    return TrendSeriesResponse(profile_id=pid, points=points)


@router.get(
    "/trends/profiles/{profile_id}/snapshots/{period}",
    response_model=TrendSnapshotDetail,
)
def get_trends_snapshot(
    profile_id: str,
    period: str,
    authorization: str | None = Header(None),
    user_id: str | None = Query(None, description="Владелец профиля (как у series)."),
) -> TrendSnapshotDetail:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    per = _validate_period(period)
    read_uid = resolve_trends_reader_user_id(authorization)
    tenant = read_uid if read_uid is not None else ((user_id or "").strip() or auth_legacy_user_id())
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if not digest_profile_exists_for_user(conn, tenant, pid):
                raise HTTPException(
                    status_code=404,
                    detail="Профиль не найден или нет доступа.",
                )
            row = fetch_snapshot_for_period(conn, tenant, pid, per)
    except HTTPException:
        raise
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    if not row:
        raise HTTPException(status_code=404, detail="Снимок за этот период не найден.")
    created_at, payload = row
    return payload_to_trend_snapshot_detail(pid, per, created_at, payload)


@router.get(
    "/trends/profiles/{profile_id}/highlights",
    response_model=TrendHighlightsResponse,
)
def get_trends_highlights(
    profile_id: str,
    authorization: str | None = Header(None),
    user_id: str | None = Query(None, description="Владелец профиля (как у series)."),
) -> TrendHighlightsResponse:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    read_uid = resolve_trends_reader_user_id(authorization)
    tenant = read_uid if read_uid is not None else ((user_id or "").strip() or auth_legacy_user_id())
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if not digest_profile_exists_for_user(conn, tenant, pid):
                raise HTTPException(
                    status_code=404,
                    detail="Профиль не найден или нет доступа.",
                )
            rows = list_snapshot_rows_for_profile(conn, tenant, pid)
    except HTTPException:
        raise
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    return build_trend_highlights(pid, rows)


@router.post(
    "/trends/profiles/{profile_id}/analysis",
    response_model=TrendAnalysisResponse,
)
async def post_trends_analysis(
    profile_id: str,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
    force: bool = Query(False, description="Пересчитать анализ, игнорируя кэш."),
) -> TrendAnalysisResponse:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    if not effective_llm_api_key():
        raise HTTPException(
            status_code=503,
            detail="Ключ LLM не настроен на сервере (OPENAI_API_KEY).",
        )
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            if not digest_profile_exists_for_user(conn, uid, pid):
                raise HTTPException(
                    status_code=404,
                    detail="Профиль не найден или нет доступа.",
                )
            rows = list_snapshot_rows_for_profile(conn, uid, pid)
            highlights = build_trend_highlights(pid, rows)
            snapshot_count = len(highlights.points)
            last_period = highlights.points[-1].period if highlights.points else None

            if snapshot_count < 2:
                return TrendAnalysisResponse(
                    profile_id=pid,
                    analyzed_through_period=last_period,
                    snapshot_count=snapshot_count,
                )

            if not force and last_period:
                cached = get_trend_analysis_cache(conn, uid, pid)
                if cached and cached[0] == last_period:
                    payload = cached[1]
                    return TrendAnalysisResponse(
                        profile_id=pid,
                        analyzed_through_period=last_period,
                        analysis_ru=str(payload.get("analysis_ru") or ""),
                        analysis_en=str(payload.get("analysis_en") or ""),
                        overview_ru=str(payload.get("overview_ru") or ""),
                        overview_en=str(payload.get("overview_en") or ""),
                        cached=True,
                        snapshot_count=snapshot_count,
                    )

            display_name = fetch_profile_display_name(conn, uid, pid) or pid
            topic_queries = list(highlights.topic_queries)

            period_payload = [p.model_dump() for p in highlights.points]
            concept_payload = [c.model_dump() for c in highlights.concept_evolution]

            if force and last_period:
                delete_trend_analysis_cache(conn, uid, pid)

            llm_result = await generate_trend_series_analysis_llm(
                display_name=display_name,
                topic_queries=topic_queries,
                period_highlights=period_payload,
                concept_evolution=concept_payload,
            )

            if last_period:
                upsert_trend_analysis_cache(conn, uid, pid, last_period, llm_result)

            return TrendAnalysisResponse(
                profile_id=pid,
                analyzed_through_period=last_period,
                analysis_ru=llm_result.get("analysis_ru", ""),
                analysis_en=llm_result.get("analysis_en", ""),
                overview_ru=llm_result.get("overview_ru", ""),
                overview_en=llm_result.get("overview_en", ""),
                cached=False,
                snapshot_count=snapshot_count,
            )
    except HTTPException:
        raise
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e


@router.delete("/trends/profiles/{profile_id}", status_code=204)
def delete_trends_profile(
    profile_id: str,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> Response:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            ok = delete_digest_profile(conn, uid, pid)
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Профиль не найден или принадлежит другому пользователю.")
    return Response(status_code=204)


@router.put("/trends/profiles/{profile_id}/label")
def put_trends_profile_label(
    profile_id: str,
    body: TrendProfileLabelUpdate,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> dict[str, str]:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    try:
        with snapshot_connection(settings.snapshot_database_url) as conn:
            init_snapshot_schema(conn)
            n = upsert_profile_label(conn, uid, pid, body.display_name, body.note or None)
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    if n == 0:
        raise HTTPException(status_code=404, detail="Профиль не найден или принадлежит другому пользователю.")
    return {"status": "ok", "profile_id": pid}
