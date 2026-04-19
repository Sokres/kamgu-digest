"""Сохранённые разовые дайджесты (та же БД, что и снимки)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import sqlite3

from psycopg import Connection as PgConnection


def _ph(backend: str) -> str:
    return "?" if backend == "sqlite" else "%s"


def new_saved_digest_id() -> str:
    return uuid.uuid4().hex


def insert_saved_digest(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    title: str,
    payload: dict[str, Any],
) -> tuple[str, str]:
    """Вставляет запись. Возвращает (id, created_at ISO)."""
    sid = new_saved_digest_id()
    now = datetime.now(timezone.utc).isoformat()
    raw = json.dumps(payload, ensure_ascii=False)
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"""
        INSERT INTO saved_digests (id, user_id, title, created_at, payload_json)
        VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
    """
    conn.execute(sql, (sid, user_id, title.strip(), now, raw))
    return sid, now


def list_saved_digests_for_user(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    *,
    limit: int = 200,
) -> list[tuple[str, str, str, str]]:
    """Список (id, title, created_at, payload_json) для пользователя, новые первые."""
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    lim = max(1, min(int(limit), 500))
    sql = f"""
        SELECT id, title, created_at, payload_json FROM saved_digests
        WHERE user_id = {ph}
        ORDER BY created_at DESC
        LIMIT {lim}
    """
    cur = conn.execute(sql, (user_id,))
    rows = cur.fetchall()
    return [(str(r[0]), str(r[1]), str(r[2]), str(r[3])) for r in rows]


def get_saved_digest_row(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    digest_id: str,
) -> tuple[str, str, str, str] | None:
    """Одна строка (id, title, created_at, payload_json) или None."""
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"""
        SELECT id, title, created_at, payload_json FROM saved_digests
        WHERE user_id = {ph} AND id = {ph}
    """
    row = conn.execute(sql, (user_id, digest_id)).fetchone()
    if not row:
        return None
    return str(row[0]), str(row[1]), str(row[2]), str(row[3])


def delete_saved_digest(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    digest_id: str,
) -> bool:
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"DELETE FROM saved_digests WHERE user_id = {ph} AND id = {ph}"
    cur = conn.execute(sql, (user_id, digest_id))
    rc = getattr(cur, "rowcount", None)
    if rc is None:
        return False
    return int(rc) > 0
