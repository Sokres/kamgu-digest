"""Серверные refresh-сессии (opaque token, в БД хранится только SHA-256)."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from psycopg import Connection as PgConnection

from digest.config import settings
from digest.snapshot_store import _backend_of_conn, _ph


def _hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at_iso() -> str:
    days = max(1, int(settings.auth_refresh_token_expire_days or 30))
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def create_refresh_session(conn: sqlite3.Connection | PgConnection, user_id: str) -> str:
    """Возвращает открытый refresh-токен для клиента (один раз)."""
    uid = user_id.strip()
    if not uid:
        raise ValueError("user_id пустой")
    plain = secrets.token_urlsafe(48)
    th = _hash_refresh_token(plain)
    sid = str(uuid.uuid4())
    exp = _expires_at_iso()
    now = _now_iso()
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        INSERT INTO auth_refresh_sessions (id, user_id, token_hash, expires_at, created_at)
        VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
    """
    conn.execute(sql, (sid, uid, th, exp, now))
    return plain


def take_refresh_session_user_id(conn: sqlite3.Connection | PgConnection, plain_token: str) -> str | None:
    """Проверяет refresh, удаляет строку (одноразовое использование). Возвращает user_id или None."""
    raw = (plain_token or "").strip()
    if not raw:
        return None
    th = _hash_refresh_token(raw)
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT id, user_id, expires_at FROM auth_refresh_sessions WHERE token_hash = {ph}
    """
    row = conn.execute(sql, (th,)).fetchone()
    if not row:
        return None
    user_id, exp_s = str(row[1]), str(row[2])
    try:
        exp = datetime.fromisoformat(exp_s.replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        conn.execute(f"DELETE FROM auth_refresh_sessions WHERE token_hash = {ph}", (th,))
        return None
    if datetime.now(timezone.utc) > exp:
        conn.execute(f"DELETE FROM auth_refresh_sessions WHERE token_hash = {ph}", (th,))
        return None
    conn.execute(f"DELETE FROM auth_refresh_sessions WHERE token_hash = {ph}", (th,))
    return user_id.strip()


def revoke_refresh_by_plain(conn: sqlite3.Connection | PgConnection, plain_token: str) -> None:
    raw = (plain_token or "").strip()
    if not raw:
        return
    th = _hash_refresh_token(raw)
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    conn.execute(f"DELETE FROM auth_refresh_sessions WHERE token_hash = {ph}", (th,))


def revoke_all_refresh_for_user(conn: sqlite3.Connection | PgConnection, user_id: str) -> None:
    uid = user_id.strip()
    if not uid:
        return
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    conn.execute(f"DELETE FROM auth_refresh_sessions WHERE user_id = {ph}", (uid,))
