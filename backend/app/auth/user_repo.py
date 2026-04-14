"""Пользователи в таблице auth_users (та же БД, что и снимки)."""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

import bcrypt
from psycopg import Connection as PgConnection

from digest.snapshot_store import _backend_of_conn, _ph


def hash_password(raw: str) -> str:
    """Bcrypt: не более 72 байт UTF-8 (проверка в модели API)."""
    pw = raw.encode("utf-8")
    if len(pw) > 72:
        raise ValueError("Пароль длиннее 72 байт (ограничение bcrypt).")
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("ascii")


def _hash_to_bytes(hashed: str | bytes | memoryview) -> bytes:
    if isinstance(hashed, str):
        return hashed.strip().encode("utf-8")
    if isinstance(hashed, memoryview):
        return hashed.tobytes()
    return bytes(hashed)


def verify_password(raw: str, hashed: str | bytes | memoryview) -> bool:
    """Совместимо с TEXT (str) и бинарным представлением из драйвера БД."""
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), _hash_to_bytes(hashed))
    except (ValueError, TypeError):
        return False


@dataclass(frozen=True)
class AuthUser:
    id: str
    username: str
    password_hash: str
    created_at: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_text_cell(val: object) -> str:
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, memoryview):
        return val.tobytes().decode("utf-8", errors="replace").strip()
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace").strip()
    return str(val).strip()


def create_user(
    conn: sqlite3.Connection | PgConnection,
    username: str,
    password: str,
) -> AuthUser:
    uid = str(uuid.uuid4())
    now = _now_iso()
    uname = username.strip().lower()
    if not uname:
        raise ValueError("username пустой")
    h = hash_password(password)
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        INSERT INTO auth_users (id, username, password_hash, created_at)
        VALUES ({ph}, {ph}, {ph}, {ph})
    """
    conn.execute(sql, (uid, uname, h, now))
    return AuthUser(id=uid, username=uname, password_hash=h, created_at=now)


def get_user_by_username(
    conn: sqlite3.Connection | PgConnection, username: str
) -> AuthUser | None:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    uname = username.strip().lower()
    sql = f"SELECT id, username, password_hash, created_at FROM auth_users WHERE username = {ph}"
    row = conn.execute(sql, (uname,)).fetchone()
    if not row:
        return None
    uid, u, phash, cat = row
    return AuthUser(
        id=str(uid),
        username=_coerce_text_cell(u),
        password_hash=_coerce_text_cell(phash),
        created_at=_coerce_text_cell(cat),
    )


def get_user_by_id(conn: sqlite3.Connection | PgConnection, user_id: str) -> AuthUser | None:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"SELECT id, username, password_hash, created_at FROM auth_users WHERE id = {ph}"
    row = conn.execute(sql, (user_id.strip(),)).fetchone()
    if not row:
        return None
    uid, u, phash, cat = row
    return AuthUser(
        id=str(uid),
        username=_coerce_text_cell(u),
        password_hash=_coerce_text_cell(phash),
        created_at=_coerce_text_cell(cat),
    )
