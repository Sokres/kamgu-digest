import logging
import sqlite3

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query

from digest.config import settings
from digest.models import TrendProfileLabelUpdate, TrendProfileSummary, TrendSeriesPoint, TrendSeriesResponse
from digest.snapshot_store import (
    init_snapshot_schema,
    list_period_metrics_for_profile,
    list_profile_summaries,
    upsert_profile_label,
    snapshot_connection,
)
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
            points_raw = list_period_metrics_for_profile(conn, tenant, pid)
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    points = [TrendSeriesPoint.model_validate(p) for p in points_raw]
    return TrendSeriesResponse(profile_id=pid, points=points)


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
            upsert_profile_label(conn, uid, pid, body.display_name, body.note or None)
    except (psycopg.Error, sqlite3.Error, OSError, ValueError) as e:
        raise _snapshot_http_exc(e) from e
    return {"status": "ok", "profile_id": pid}
