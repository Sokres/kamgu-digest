"""Хранилище ежемесячных снимков: PostgreSQL (прод) или SQLite (локально без Docker)."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import urlparse

import psycopg
from psycopg import Connection as PgConnection

CREATE_SQL_SQLITE = """
CREATE TABLE IF NOT EXISTS digest_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(profile_id, period)
);
"""

CREATE_SQL_POSTGRES = """
CREATE TABLE IF NOT EXISTS digest_snapshots (
    id BIGSERIAL PRIMARY KEY,
    profile_id TEXT NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(profile_id, period)
);
"""

Backend = Literal["sqlite", "postgres"]


def _backend_from_url(database_url: str) -> Backend:
    u = (database_url or "").strip().lower()
    if u.startswith("sqlite:"):
        return "sqlite"
    if u.startswith("postgresql:") or u.startswith("postgres:"):
        return "postgres"
    raise ValueError(
        "snapshot_database_url must be sqlite:... or postgresql:... "
        f"(got prefix: {database_url[:24]!r}...). "
        "Examples: postgresql://user:pass@host:5432/dbname, sqlite:///./snapshots.db"
    )


def _normalize_postgres_url(database_url: str) -> str:
    u = database_url.strip()
    if u.startswith("postgresql+psycopg://"):
        return "postgresql://" + u[len("postgresql+psycopg://") :]
    if u.startswith("postgres+psycopg://"):
        return "postgres://" + u[len("postgres+psycopg://") :]
    return u


def _connect_path_from_sqlite_url(database_url: str) -> str:
    u = (database_url or "").strip()
    if not u.startswith("sqlite:///"):
        raise ValueError(
            "SQLite URL must start with sqlite:/// "
            f"(got prefix: {u[:20]!r}...). Example: sqlite:////data/snapshots.db"
        )
    return u[len("sqlite:///") :]


def _ph(backend: Backend) -> str:
    return "?" if backend == "sqlite" else "%s"


@contextmanager
def snapshot_connection(database_url: str) -> Iterator[sqlite3.Connection | PgConnection]:
    backend = _backend_from_url(database_url)
    if backend == "sqlite":
        path = _connect_path_from_sqlite_url(database_url)
        if path and path != ":memory:":
            parent = Path(path).parent
            if str(parent) not in (".", ""):
                parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(path, check_same_thread=False)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
    else:
        url = _normalize_postgres_url(database_url)
        parsed = urlparse(url)
        if not parsed.path or parsed.path == "/":
            raise ValueError(
                "PostgreSQL URL must include a database name in the path, "
                "e.g. postgresql://user:pass@host:5432/kamgu_digest"
            )
        conn = psycopg.connect(url, autocommit=False)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def _backend_of_conn(conn: sqlite3.Connection | PgConnection) -> Backend:
    if isinstance(conn, sqlite3.Connection):
        return "sqlite"
    return "postgres"


def init_snapshot_schema(conn: sqlite3.Connection | PgConnection) -> None:
    backend = _backend_of_conn(conn)
    if backend == "sqlite":
        conn.executescript(CREATE_SQL_SQLITE)
    else:
        conn.execute(CREATE_SQL_POSTGRES)


def fetch_latest_snapshot_before(
    conn: sqlite3.Connection | PgConnection,
    profile_id: str,
    current_period: str,
) -> tuple[str, dict[str, Any]] | None:
    """Предыдущий снимок: максимальный period, лексикографически меньше current_period (YYYY-MM)."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT period, payload_json FROM digest_snapshots
        WHERE profile_id = {ph} AND period < {ph}
        ORDER BY period DESC
        LIMIT 1
    """
    row = conn.execute(sql, (profile_id, current_period)).fetchone()
    if not row:
        return None
    period, raw = row[0], row[1]
    return period, json.loads(raw)


def upsert_snapshot(
    conn: sqlite3.Connection | PgConnection,
    profile_id: str,
    period: str,
    payload: dict[str, Any],
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    raw = json.dumps(payload, ensure_ascii=False)
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    if backend == "sqlite":
        sql = f"""
            INSERT INTO digest_snapshots (profile_id, period, created_at, payload_json)
            VALUES ({ph}, {ph}, {ph}, {ph})
            ON CONFLICT(profile_id, period) DO UPDATE SET
                created_at = excluded.created_at,
                payload_json = excluded.payload_json
        """
    else:
        sql = f"""
            INSERT INTO digest_snapshots (profile_id, period, created_at, payload_json)
            VALUES ({ph}, {ph}, {ph}, {ph})
            ON CONFLICT (profile_id, period) DO UPDATE SET
                created_at = EXCLUDED.created_at,
                payload_json = EXCLUDED.payload_json
        """
    conn.execute(sql, (profile_id, period, now, raw))
