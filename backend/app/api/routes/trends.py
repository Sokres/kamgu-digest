from fastapi import APIRouter, Depends, HTTPException

from digest.config import settings
from digest.models import TrendProfileLabelUpdate, TrendProfileSummary, TrendSeriesPoint, TrendSeriesResponse
from digest.snapshot_store import (
    init_snapshot_schema,
    list_period_metrics_for_profile,
    list_profile_summaries,
    snapshot_connection,
    upsert_profile_label,
)
from app.api.deps import verify_internal_cron_secret

router = APIRouter(tags=["trends"])


@router.get("/trends/profiles", response_model=list[TrendProfileSummary])
def list_trends_profiles() -> list[TrendProfileSummary]:
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        rows = list_profile_summaries(conn)
    return [TrendProfileSummary.model_validate(r) for r in rows]


@router.get("/trends/profiles/{profile_id}/series", response_model=TrendSeriesResponse)
def get_trends_series(profile_id: str) -> TrendSeriesResponse:
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        points_raw = list_period_metrics_for_profile(conn, pid)
    points = [TrendSeriesPoint.model_validate(p) for p in points_raw]
    return TrendSeriesResponse(profile_id=pid, points=points)


@router.put("/trends/profiles/{profile_id}/label")
def put_trends_profile_label(
    profile_id: str,
    body: TrendProfileLabelUpdate,
    _: None = Depends(verify_internal_cron_secret),
) -> dict[str, str]:
    """Подпись к profile_id для UI (при MONTHLY_DIGEST_CRON_SECRET — тот же X-Internal-Key, что для /digests/periodic)."""
    pid = profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой")
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        upsert_profile_label(conn, pid, body.display_name, body.note or None)
    return {"status": "ok", "profile_id": pid}
