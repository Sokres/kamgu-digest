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
CREATE TABLE IF NOT EXISTS trend_profile_labels (
    profile_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    note TEXT,
    updated_at TEXT NOT NULL
);
"""

CREATE_SQL_POSTGRES_DIGEST = """
CREATE TABLE IF NOT EXISTS digest_snapshots (
    id BIGSERIAL PRIMARY KEY,
    profile_id TEXT NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(profile_id, period)
);
"""

CREATE_SQL_POSTGRES_LABELS = """
CREATE TABLE IF NOT EXISTS trend_profile_labels (
    profile_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    note TEXT,
    updated_at TEXT NOT NULL
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
        conn.execute(CREATE_SQL_POSTGRES_DIGEST)
        conn.execute(CREATE_SQL_POSTGRES_LABELS)


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


def _payload_topic_and_work_count(payload: dict[str, Any]) -> tuple[list[str], int]:
    raw_tq = payload.get("topic_queries")
    if isinstance(raw_tq, list):
        topic_queries = [str(x).strip() for x in raw_tq if str(x).strip()]
    else:
        topic_queries = []
    works = payload.get("works")
    work_count = len(works) if isinstance(works, list) else 0
    return topic_queries, work_count


def upsert_profile_label(
    conn: sqlite3.Connection | PgConnection,
    profile_id: str,
    display_name: str,
    note: str | None,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    note_v = (note or "").strip()
    if backend == "sqlite":
        sql = f"""
            INSERT INTO trend_profile_labels (profile_id, display_name, note, updated_at)
            VALUES ({ph}, {ph}, {ph}, {ph})
            ON CONFLICT(profile_id) DO UPDATE SET
                display_name = excluded.display_name,
                note = excluded.note,
                updated_at = excluded.updated_at
        """
    else:
        sql = f"""
            INSERT INTO trend_profile_labels (profile_id, display_name, note, updated_at)
            VALUES ({ph}, {ph}, {ph}, {ph})
            ON CONFLICT (profile_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                note = EXCLUDED.note,
                updated_at = EXCLUDED.updated_at
        """
    conn.execute(sql, (profile_id, display_name.strip(), note_v, now))


def list_profile_summaries(
    conn: sqlite3.Connection | PgConnection,
) -> list[dict[str, Any]]:
    """По одной строке на profile_id: последний период, счётчик снимков, подпись."""
    backend = _backend_of_conn(conn)
    sql = f"""
        SELECT d.profile_id, d.period, d.created_at, d.payload_json, sc.cnt,
               l.display_name, l.note
        FROM digest_snapshots d
        INNER JOIN (
            SELECT profile_id, MAX(period) AS mp
            FROM digest_snapshots
            GROUP BY profile_id
        ) t ON d.profile_id = t.profile_id AND d.period = t.mp
        INNER JOIN (
            SELECT profile_id, COUNT(*) AS cnt
            FROM digest_snapshots
            GROUP BY profile_id
        ) sc ON d.profile_id = sc.profile_id
        LEFT JOIN trend_profile_labels l ON l.profile_id = d.profile_id
        ORDER BY d.profile_id
    """
    cur = conn.execute(sql)
    rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        profile_id, period, created_at, raw_payload, cnt, display_name, note = row
        try:
            payload = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
        except json.JSONDecodeError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        tq, wc = _payload_topic_and_work_count(payload)
        out.append(
            {
                "profile_id": profile_id,
                "snapshot_count": int(cnt),
                "last_period": period,
                "last_created_at": created_at,
                "topic_queries": tq,
                "work_count_last": wc,
                "display_name": display_name,
                "note": note or "",
            }
        )
    return out


def list_period_metrics_for_profile(
    conn: sqlite3.Connection | PgConnection,
    profile_id: str,
) -> list[dict[str, Any]]:
    """Хронология снимков по profile_id: размер топа (works), дельта к прошлому периоду."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT period, created_at, payload_json FROM digest_snapshots
        WHERE profile_id = {ph}
        ORDER BY period ASC
    """
    cur = conn.execute(sql, (profile_id,))
    rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    prev_wc: int | None = None
    for period, created_at, raw_payload in rows:
        try:
            payload = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
        except json.JSONDecodeError:
            payload = {}
        if not isinstance(payload, dict):
            payload = {}
        tq, wc = _payload_topic_and_work_count(payload)
        delta = None if prev_wc is None else wc - prev_wc
        pct: float | None = None
        if prev_wc is not None:
            if prev_wc != 0:
                pct = round(100.0 * (wc - prev_wc) / prev_wc, 2)
        out.append(
            {
                "period": period,
                "created_at": created_at,
                "work_count": wc,
                "topic_queries": tq,
                "delta_vs_prev": delta,
                "pct_change_vs_prev": pct,
            }
        )
        prev_wc = wc
    return out
