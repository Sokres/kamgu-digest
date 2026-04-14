"""CRUD расписаний периодического дайджеста (таблица periodic_digest_schedules)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from psycopg import Connection as PgConnection

from digest.models import (
    PeriodicDigestScheduleCreate,
    PeriodicDigestScheduleOut,
    PeriodicDigestScheduleParams,
    PeriodicDigestScheduleUpdate,
)
from digest.snapshot_store import _backend_of_conn, _ph


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _params_to_json(params: PeriodicDigestScheduleParams) -> str:
    return json.dumps(params.model_dump(), ensure_ascii=False)


def _row_to_params(raw: str) -> PeriodicDigestScheduleParams:
    data = json.loads(raw) if isinstance(raw, str) else raw
    return PeriodicDigestScheduleParams.model_validate(data)


def _row_to_out(
    row: tuple[Any, ...],
) -> PeriodicDigestScheduleOut:
    (
        sid,
        user_id,
        profile_id,
        enabled_raw,
        cron_utc,
        params_json,
        created_at,
        updated_at,
        last_run_at,
        last_status,
        last_error,
    ) = row
    p = _row_to_params(params_json)
    enabled = bool(enabled_raw) if enabled_raw is not None else True
    return PeriodicDigestScheduleOut(
        id=sid,
        user_id=str(user_id or ""),
        profile_id=profile_id,
        cron_utc=cron_utc,
        enabled=enabled,
        topic_queries=p.topic_queries,
        max_candidates=p.max_candidates,
        top_n_for_llm=p.top_n_for_llm,
        trend_top_k=p.trend_top_k,
        from_year=p.from_year,
        to_year=p.to_year,
        exclude_dois=p.exclude_dois,
        created_at=created_at,
        updated_at=updated_at,
        last_run_at=last_run_at,
        last_status=last_status,
        last_error=last_error,
    )


def list_schedules(
    conn: sqlite3.Connection | PgConnection,
    user_id: str | None = None,
) -> list[PeriodicDigestScheduleOut]:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    if user_id is None:
        sql = """
            SELECT id, user_id, profile_id, enabled, cron_utc, params_json, created_at, updated_at,
                   last_run_at, last_status, last_error
            FROM periodic_digest_schedules
            ORDER BY user_id, profile_id, id
        """
        cur = conn.execute(sql)
    else:
        sql = f"""
            SELECT id, user_id, profile_id, enabled, cron_utc, params_json, created_at, updated_at,
                   last_run_at, last_status, last_error
            FROM periodic_digest_schedules
            WHERE user_id = {ph}
            ORDER BY profile_id, id
        """
        cur = conn.execute(sql, (user_id,))
    rows = cur.fetchall()
    return [_row_to_out(tuple(r)) for r in rows]


def get_schedule(
    conn: sqlite3.Connection | PgConnection,
    schedule_id: str,
    user_id: str | None = None,
) -> PeriodicDigestScheduleOut | None:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    if user_id is None:
        sql = f"""
            SELECT id, user_id, profile_id, enabled, cron_utc, params_json, created_at, updated_at,
                   last_run_at, last_status, last_error
            FROM periodic_digest_schedules WHERE id = {ph}
        """
        row = conn.execute(sql, (schedule_id,)).fetchone()
    else:
        sql = f"""
            SELECT id, user_id, profile_id, enabled, cron_utc, params_json, created_at, updated_at,
                   last_run_at, last_status, last_error
            FROM periodic_digest_schedules WHERE id = {ph} AND user_id = {ph}
        """
        row = conn.execute(sql, (schedule_id, user_id)).fetchone()
    if not row:
        return None
    return _row_to_out(tuple(row))


def insert_schedule(
    conn: sqlite3.Connection | PgConnection,
    body: PeriodicDigestScheduleCreate,
    user_id: str,
) -> PeriodicDigestScheduleOut:
    sid = str(uuid.uuid4())
    now = _now_iso()
    params = PeriodicDigestScheduleParams(
        topic_queries=body.topic_queries,
        max_candidates=body.max_candidates,
        top_n_for_llm=body.top_n_for_llm,
        trend_top_k=body.trend_top_k,
        from_year=body.from_year,
        to_year=body.to_year,
        exclude_dois=body.exclude_dois,
    )
    raw = _params_to_json(params)
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    en = 1 if body.enabled else 0 if backend == "sqlite" else body.enabled
    if backend == "sqlite":
        sql = f"""
            INSERT INTO periodic_digest_schedules (
                id, user_id, profile_id, enabled, cron_utc, params_json, created_at, updated_at
            ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
        """
        conn.execute(
            sql,
            (sid, user_id, body.profile_id, en, body.cron_utc.strip(), raw, now, now),
        )
    else:
        sql = f"""
            INSERT INTO periodic_digest_schedules (
                id, user_id, profile_id, enabled, cron_utc, params_json, created_at, updated_at
            ) VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph}, {ph})
        """
        conn.execute(
            sql,
            (sid, user_id, body.profile_id, body.enabled, body.cron_utc.strip(), raw, now, now),
        )
    out = get_schedule(conn, sid, user_id=None)
    assert out is not None
    return out


def update_schedule(
    conn: sqlite3.Connection | PgConnection,
    schedule_id: str,
    patch: PeriodicDigestScheduleUpdate,
    user_id: str | None = None,
) -> PeriodicDigestScheduleOut | None:
    cur = get_schedule(conn, schedule_id, user_id=user_id)
    if not cur:
        return None
    params = PeriodicDigestScheduleParams(
        topic_queries=patch.topic_queries if patch.topic_queries is not None else cur.topic_queries,
        max_candidates=patch.max_candidates if patch.max_candidates is not None else cur.max_candidates,
        top_n_for_llm=patch.top_n_for_llm if patch.top_n_for_llm is not None else cur.top_n_for_llm,
        trend_top_k=patch.trend_top_k if patch.trend_top_k is not None else cur.trend_top_k,
        from_year=patch.from_year if patch.from_year is not None else cur.from_year,
        to_year=patch.to_year if patch.to_year is not None else cur.to_year,
        exclude_dois=patch.exclude_dois if patch.exclude_dois is not None else cur.exclude_dois,
    )
    cron = patch.cron_utc.strip() if patch.cron_utc is not None else cur.cron_utc
    enabled = cur.enabled if patch.enabled is None else patch.enabled
    now = _now_iso()
    raw = _params_to_json(params)
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    en = 1 if enabled else 0 if backend == "sqlite" else enabled
    if user_id is None:
        where = f"id = {ph}"
        wargs: tuple[Any, ...] = (schedule_id,)
    else:
        where = f"id = {ph} AND user_id = {ph}"
        wargs = (schedule_id, user_id)
    if backend == "sqlite":
        sql = f"""
            UPDATE periodic_digest_schedules SET
                cron_utc = {ph},
                enabled = {ph},
                params_json = {ph},
                updated_at = {ph}
            WHERE {where}
        """
        conn.execute(sql, (cron, en, raw, now) + wargs)
    else:
        sql = f"""
            UPDATE periodic_digest_schedules SET
                cron_utc = {ph},
                enabled = {ph},
                params_json = {ph},
                updated_at = {ph}
            WHERE {where}
        """
        conn.execute(sql, (cron, enabled, raw, now) + wargs)
    return get_schedule(conn, schedule_id, user_id=user_id)


def delete_schedule(
    conn: sqlite3.Connection | PgConnection,
    schedule_id: str,
    user_id: str | None = None,
) -> bool:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    if user_id is None:
        cur = conn.execute(f"DELETE FROM periodic_digest_schedules WHERE id = {ph}", (schedule_id,))
    else:
        cur = conn.execute(
            f"DELETE FROM periodic_digest_schedules WHERE id = {ph} AND user_id = {ph}",
            (schedule_id, user_id),
        )
    if backend == "sqlite":
        return cur.rowcount > 0
    return cur.rowcount is not None and cur.rowcount > 0


def update_last_run(
    conn: sqlite3.Connection | PgConnection,
    schedule_id: str,
    status: str,
    error: str | None,
) -> None:
    now = _now_iso()
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    err = (error or "")[:8000]
    sql = f"""
        UPDATE periodic_digest_schedules SET
            last_run_at = {ph},
            last_status = {ph},
            last_error = {ph},
            updated_at = {ph}
        WHERE id = {ph}
    """
    conn.execute(sql, (now, status, err, now, schedule_id))


def fetch_schedule_row_for_job(
    conn: sqlite3.Connection | PgConnection, schedule_id: str
) -> tuple[str, str, str, bool, str, PeriodicDigestScheduleParams] | None:
    """Для задачи: id, user_id, profile_id, enabled, cron_utc, params."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT id, user_id, profile_id, enabled, cron_utc, params_json
        FROM periodic_digest_schedules WHERE id = {ph}
    """
    row = conn.execute(sql, (schedule_id,)).fetchone()
    if not row:
        return None
    sid, uid, profile_id, enabled_raw, cron_utc, params_json = row
    enabled = bool(enabled_raw) if enabled_raw is not None else True
    params = _row_to_params(params_json)
    return sid, str(uid or ""), profile_id, enabled, str(cron_utc).strip(), params


def load_enabled_schedules(
    conn: sqlite3.Connection | PgConnection,
) -> list[tuple[str, str]]:
    """Список (id, cron_utc) для включённых записей."""
    backend = _backend_of_conn(conn)
    if backend == "sqlite":
        sql = "SELECT id, cron_utc FROM periodic_digest_schedules WHERE enabled = 1"
    else:
        sql = "SELECT id, cron_utc FROM periodic_digest_schedules WHERE enabled IS TRUE"
    cur = conn.execute(sql)
    rows = cur.fetchall()
    return [(str(r[0]), str(r[1]).strip()) for r in rows]
