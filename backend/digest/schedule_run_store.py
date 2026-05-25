"""Журнал запусков периодических дайджестов (digest_schedule_runs)."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from psycopg import Connection as PgConnection

from digest.snapshot_store import _backend_of_conn, _ph


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def insert_schedule_run(
    conn: sqlite3.Connection | PgConnection,
    schedule_id: str,
    user_id: str,
    status: str,
    message: str | None,
) -> str:
    """Добавить запись о завершении запуска. Возвращает id строки."""
    rid = uuid.uuid4().hex
    finished = _now_iso()
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    msg = (message or "")[:8000]
    sql = f"""
        INSERT INTO digest_schedule_runs (id, schedule_id, user_id, finished_at, status, message)
        VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph})
    """
    conn.execute(sql, (rid, schedule_id, user_id, finished, status, msg))
    return rid


def list_schedule_runs(
    conn: sqlite3.Connection | PgConnection,
    schedule_id: str,
    *,
    user_id: str | None = None,
    limit: int = 50,
) -> list[tuple[str, str, str, str, str, str]]:
    """Список (id, schedule_id, user_id, finished_at, status, message), новые первые."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    lim = max(1, min(int(limit), 200))
    if user_id is None:
        sql = f"""
            SELECT id, schedule_id, user_id, finished_at, status, message
            FROM digest_schedule_runs
            WHERE schedule_id = {ph}
            ORDER BY finished_at DESC
            LIMIT {lim}
        """
        cur = conn.execute(sql, (schedule_id,))
    else:
        sql = f"""
            SELECT id, schedule_id, user_id, finished_at, status, message
            FROM digest_schedule_runs
            WHERE schedule_id = {ph} AND user_id = {ph}
            ORDER BY finished_at DESC
            LIMIT {lim}
        """
        cur = conn.execute(sql, (schedule_id, user_id))
    rows = cur.fetchall()
    out: list[tuple[str, str, str, str, str, str]] = []
    for r in rows:
        out.append(
            (
                str(r[0]),
                str(r[1]),
                str(r[2] or ""),
                str(r[3]),
                str(r[4]),
                str(r[5] or ""),
            )
        )
    return out
