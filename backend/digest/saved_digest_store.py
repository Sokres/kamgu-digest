"""Сохранённые разовые дайджесты (та же БД, что и снимки)."""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

import sqlite3

from psycopg import Connection as PgConnection


def _ph(backend: str) -> str:
    return "?" if backend == "sqlite" else "%s"


def new_saved_digest_id() -> str:
    return uuid.uuid4().hex


def _new_share_token() -> str:
    return secrets.token_urlsafe(32)


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
) -> list[tuple[str, str, str, str, bool]]:
    """Список (id, title, created_at, payload_json, has_public_share), новые первые."""
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    lim = max(1, min(int(limit), 500))
    if backend == "sqlite":
        share_expr = "CASE WHEN share_token IS NOT NULL AND share_token != '' THEN 1 ELSE 0 END"
    else:
        share_expr = "CASE WHEN share_token IS NOT NULL AND share_token <> '' THEN TRUE ELSE FALSE END"
    sql = f"""
        SELECT id, title, created_at, payload_json, {share_expr} AS has_share
        FROM saved_digests
        WHERE user_id = {ph}
        ORDER BY created_at DESC
        LIMIT {lim}
    """
    cur = conn.execute(sql, (user_id,))
    rows = cur.fetchall()
    out: list[tuple[str, str, str, str, bool]] = []
    for r in rows:
        hs = r[4]
        if backend == "sqlite":
            share_b = bool(hs) if hs is not None else False
        else:
            share_b = bool(hs)
        out.append((str(r[0]), str(r[1]), str(r[2]), str(r[3]), share_b))
    return out


def get_saved_digest_row(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    digest_id: str,
) -> tuple[str, str, str, str, str | None] | None:
    """Одна строка (id, title, created_at, payload_json, share_token) или None."""
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"""
        SELECT id, title, created_at, payload_json, share_token FROM saved_digests
        WHERE user_id = {ph} AND id = {ph}
    """
    row = conn.execute(sql, (user_id, digest_id)).fetchone()
    if not row:
        return None
    tok = row[4]
    return str(row[0]), str(row[1]), str(row[2]), str(row[3]), (str(tok) if tok else None)


def get_saved_digest_by_share_token(
    conn: sqlite3.Connection | PgConnection,
    token: str,
) -> tuple[str, str, str, str] | None:
    """Публичный доступ: (id, title, created_at, payload_json) по share_token."""
    t = (token or "").strip()
    if not t:
        return None
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"""
        SELECT id, title, created_at, payload_json FROM saved_digests
        WHERE share_token = {ph}
    """
    row = conn.execute(sql, (t,)).fetchone()
    if not row:
        return None
    return str(row[0]), str(row[1]), str(row[2]), str(row[3])


def ensure_saved_digest_share(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    digest_id: str,
    *,
    rotate: bool = False,
) -> str:
    """Создаёт или возвращает share_token; при rotate — новый токен."""
    row = get_saved_digest_row(conn, user_id, digest_id)
    if not row:
        raise KeyError("digest not found")
    _id, _title, _ca, _pj, existing = row
    if existing and not rotate:
        return existing
    token = _new_share_token()
    now = datetime.now(timezone.utc).isoformat()
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"""
        UPDATE saved_digests SET share_token = {ph}, share_created_at = {ph}
        WHERE user_id = {ph} AND id = {ph}
    """
    conn.execute(sql, (token, now, user_id, digest_id))
    return token


def revoke_saved_digest_share(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    digest_id: str,
) -> bool:
    backend = "sqlite" if isinstance(conn, sqlite3.Connection) else "postgres"
    ph = _ph(backend)
    sql = f"""
        UPDATE saved_digests SET share_token = NULL, share_created_at = NULL
        WHERE user_id = {ph} AND id = {ph}
    """
    cur = conn.execute(sql, (user_id, digest_id))
    rc = getattr(cur, "rowcount", None)
    if rc is None:
        return False
    return int(rc) > 0


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
