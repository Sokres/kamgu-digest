"""CRUD расписаний периодического дайджеста (встроенный планировщик)."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Query

from digest.config import settings
from digest.models import (
    DigestScheduleRunOut,
    DigestSchedulesListResponse,
    PeriodicDigestScheduleCreate,
    PeriodicDigestScheduleOut,
    PeriodicDigestScheduleUpdate,
)
from digest.periodic_scheduler import reload_schedules, scheduler_running, validate_cron_utc
from digest.schedule_run_store import list_schedule_runs
from digest.schedule_store import (
    delete_schedule,
    get_schedule,
    insert_schedule,
    list_schedules,
    update_schedule,
)
from digest.snapshot_store import (
    digest_profile_exists_for_user,
    init_snapshot_schema,
    snapshot_connection,
)
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
    pid = body.profile_id.strip()
    if not pid:
        raise HTTPException(status_code=400, detail="profile_id пустой.")
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        if not digest_profile_exists_for_user(conn, uid, pid):
            raise HTTPException(
                status_code=404,
                detail="Профиль не найден. Создайте направление (POST /trends/profiles) или выберите существующий.",
            )
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


@router.get("/digests/schedules/{schedule_id}/runs", response_model=list[DigestScheduleRunOut])
def get_digest_schedule_runs(
    schedule_id: str,
    limit: int = Query(50, ge=1, le=200),
    authorization: str | None = Header(None),
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
    x_acting_user_id: str | None = Header(None, alias="X-Acting-User-Id"),
) -> list[DigestScheduleRunOut]:
    scope = resolve_schedule_list_scope(authorization, x_internal_key, x_acting_user_id)
    sid = schedule_id.strip()
    if not sid:
        raise HTTPException(status_code=400, detail="schedule_id пустой.")
    with snapshot_connection(settings.snapshot_database_url) as conn:
        init_snapshot_schema(conn)
        sch = get_schedule(conn, sid, user_id=scope)
        if not sch:
            raise HTTPException(status_code=404, detail="Расписание не найдено.")
        if scope is not None and sch.user_id != scope:
            raise HTTPException(status_code=404, detail="Расписание не найдено.")
        rows = list_schedule_runs(conn, sid, user_id=scope, limit=limit)
    return [
        DigestScheduleRunOut(
            id=r[0],
            schedule_id=r[1],
            user_id=r[2],
            finished_at=r[3],
            status=r[4],
            message=r[5] or None,
        )
        for r in rows
    ]


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
