"""CRUD расписаний периодического дайджеста (встроенный планировщик)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException

from digest.config import settings
from digest.models import (
    DigestSchedulesListResponse,
    PeriodicDigestScheduleCreate,
    PeriodicDigestScheduleOut,
    PeriodicDigestScheduleUpdate,
)
from digest.periodic_scheduler import reload_schedules, scheduler_running, validate_cron_utc
from digest.schedule_store import (
    delete_schedule,
    get_schedule,
    insert_schedule,
    list_schedules,
    update_schedule,
)
from digest.snapshot_store import init_snapshot_schema, snapshot_connection
from app.api.deps import resolve_periodic_user_id, resolve_schedule_list_scope

router = APIRouter(tags=["digests"])


def _reload_if_needed() -> None:
    reload_schedules()


@router.get("/digests/schedules", response_model=DigestSchedulesListResponse)
def get_digest_schedules(
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> DigestSchedulesListResponse:
    scope = resolve_schedule_list_scope(authorization, x_internal_key, x_acting_user_id)
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        items = list_schedules(conn, user_id=scope)
    return DigestSchedulesListResponse(
        items=items,
        scheduler_enabled_in_config=settings.digest_periodic_scheduler_enabled,
        scheduler_running=scheduler_running(),
    )


@router.post("/digests/schedules", response_model=PeriodicDigestScheduleOut)
def post_digest_schedule(
    body: PeriodicDigestScheduleCreate,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> PeriodicDigestScheduleOut:
    try:
        validate_cron_utc(body.cron_utc)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    uid = resolve_periodic_user_id(authorization, x_internal_key, x_acting_user_id)
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        out = insert_schedule(conn, body, user_id=uid)
    _reload_if_needed()
    return out


@router.get("/digests/schedules/{schedule_id}", response_model=PeriodicDigestScheduleOut)
def get_one_digest_schedule(
    schedule_id: str,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> PeriodicDigestScheduleOut:
    scope = resolve_schedule_list_scope(authorization, x_internal_key, x_acting_user_id)
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        row = get_schedule(conn, schedule_id, user_id=scope)
    if not row:
        raise HTTPException(status_code=404, detail="Расписание не найдено.")
    return row


@router.patch("/digests/schedules/{schedule_id}", response_model=PeriodicDigestScheduleOut)
def patch_digest_schedule(
    schedule_id: str,
    body: PeriodicDigestScheduleUpdate,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> PeriodicDigestScheduleOut:
    if body.cron_utc is not None:
        try:
            validate_cron_utc(body.cron_utc)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    scope = resolve_schedule_list_scope(authorization, x_internal_key, x_acting_user_id)
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        out = update_schedule(conn, schedule_id, body, user_id=scope)
    if not out:
        raise HTTPException(status_code=404, detail="Расписание не найдено.")
    _reload_if_needed()
    return out


@router.delete("/digests/schedules/{schedule_id}")
def remove_digest_schedule(
    schedule_id: str,
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> dict[str, str]:
    scope = resolve_schedule_list_scope(authorization, x_internal_key, x_acting_user_id)
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        ok = delete_schedule(conn, schedule_id, user_id=scope)
    if not ok:
        raise HTTPException(status_code=404, detail="Расписание не найдено.")
    _reload_if_needed()
    return {"status": "deleted", "id": schedule_id}
