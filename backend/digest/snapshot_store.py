"""Хранилище ежемесячных снимков: PostgreSQL (прод) или SQLite (локально без Docker)."""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Literal
from urllib.parse import urlparse

import psycopg
from psycopg import Connection as PgConnection

from digest.config import settings

logger = logging.getLogger(__name__)

CREATE_SQL_SQLITE = """
CREATE TABLE IF NOT EXISTS digest_profiles (
    profile_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digest_profiles_user ON digest_profiles(user_id);
CREATE TABLE IF NOT EXISTS app_schema_meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS digest_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(user_id, profile_id, period)
);
CREATE TABLE IF NOT EXISTS periodic_digest_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    cron_utc TEXT NOT NULL,
    params_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_run_at TEXT,
    last_status TEXT,
    last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_periodic_schedules_profile ON periodic_digest_schedules(user_id, profile_id);
CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_digests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_digests_user_created ON saved_digests(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user ON auth_refresh_sessions(user_id);
CREATE TABLE IF NOT EXISTS digest_schedule_runs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT
);
CREATE INDEX IF NOT EXISTS idx_digest_schedule_runs_sched_fin ON digest_schedule_runs(schedule_id, finished_at DESC);
"""

CREATE_SQL_POSTGRES_DIGEST = """
CREATE TABLE IF NOT EXISTS digest_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    UNIQUE(user_id, profile_id, period)
);
"""

CREATE_SQL_POSTGRES_DIGEST_PROFILES = """
CREATE TABLE IF NOT EXISTS digest_profiles (
    profile_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_digest_profiles_user ON digest_profiles(user_id);
CREATE TABLE IF NOT EXISTS app_schema_meta (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);
"""

CREATE_SQL_POSTGRES_SCHEDULES = """
CREATE TABLE IF NOT EXISTS periodic_digest_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    cron_utc TEXT NOT NULL,
    params_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_run_at TEXT,
    last_status TEXT,
    last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_periodic_schedules_profile ON periodic_digest_schedules(user_id, profile_id);
"""

CREATE_SQL_POSTGRES_AUTH_USERS = """
CREATE TABLE IF NOT EXISTS auth_users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

CREATE_SQL_POSTGRES_AUTH_REFRESH = """
CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user ON auth_refresh_sessions(user_id);
"""

CREATE_SQL_POSTGRES_SAVED_DIGESTS = """
CREATE TABLE IF NOT EXISTS saved_digests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_digests_user_created ON saved_digests(user_id, created_at DESC);
"""

CREATE_SQL_POSTGRES_SCHEDULE_RUNS_TABLE = """
CREATE TABLE IF NOT EXISTS digest_schedule_runs (
    id TEXT PRIMARY KEY,
    schedule_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT
);
"""

CREATE_SQL_POSTGRES_SCHEDULE_RUNS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_digest_schedule_runs_sched_fin ON digest_schedule_runs(schedule_id, finished_at DESC);
"""

Backend = Literal["sqlite", "postgres"]

PROFILE_UUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_DNS, "kamgu.edu.digest_profiles")
PROFILES_UUID_META_KEY = "profiles_uuid_v1"


def stable_legacy_profile_uuid(user_id: str, legacy_profile_id: str) -> str:
    """Детерминированный UUID для старых не-UUID profile_id (идемпотентная миграция)."""
    return str(uuid.uuid5(PROFILE_UUID_NAMESPACE, f"{user_id}\x1f{legacy_profile_id}"))


def _looks_like_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except ValueError:
        return False


def _sqlite_table_exists(conn: sqlite3.Connection, name: str) -> bool:
    r = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return r is not None


def _postgres_table_exists(conn: PgConnection, name: str) -> bool:
    r = conn.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = %s",
        (name,),
    ).fetchone()
    return r is not None


def _profiles_uuid_migration_done(conn: sqlite3.Connection | PgConnection) -> bool:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    try:
        row = conn.execute(
            f"SELECT v FROM app_schema_meta WHERE k = {ph}",
            (PROFILES_UUID_META_KEY,),
        ).fetchone()
    except Exception:
        return False
    return row is not None and str(row[0]) == "1"


def _mark_profiles_uuid_migration_done(conn: sqlite3.Connection | PgConnection) -> None:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    if backend == "sqlite":
        conn.execute(
            f"INSERT OR REPLACE INTO app_schema_meta (k, v) VALUES ({ph}, {ph})",
            (PROFILES_UUID_META_KEY, "1"),
        )
    else:
        conn.execute(
            """
            INSERT INTO app_schema_meta (k, v) VALUES (%s, %s)
            ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v
            """,
            (PROFILES_UUID_META_KEY, "1"),
        )


def _legacy_id() -> str:
    s = (settings.auth_legacy_user_id or "").strip()
    return s if s else "__legacy__"


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


def _sqlite_table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    cur = conn.execute(f"PRAGMA table_info({table})")
    return {str(r[1]) for r in cur.fetchall()}


def _migrate_sqlite_digest_snapshots(conn: sqlite3.Connection, legacy: str) -> None:
    if "user_id" in _sqlite_table_columns(conn, "digest_snapshots"):
        return
    logger.info("Migrating sqlite digest_snapshots: adding user_id")
    conn.executescript(
        f"""
        CREATE TABLE digest_snapshots_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            period TEXT NOT NULL,
            created_at TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            UNIQUE(user_id, profile_id, period)
        );
        INSERT INTO digest_snapshots_new (id, user_id, profile_id, period, created_at, payload_json)
        SELECT id, '{legacy}', profile_id, period, created_at, payload_json FROM digest_snapshots;
        DROP TABLE digest_snapshots;
        ALTER TABLE digest_snapshots_new RENAME TO digest_snapshots;
        """
    )


def _migrate_sqlite_trend_labels(conn: sqlite3.Connection, legacy: str) -> None:
    cols = _sqlite_table_columns(conn, "trend_profile_labels")
    if not cols:
        return
    if "user_id" in cols:
        return
    logger.info("Migrating sqlite trend_profile_labels: adding user_id")
    conn.executescript(
        f"""
        CREATE TABLE trend_profile_labels_new (
            user_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            note TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (user_id, profile_id)
        );
        INSERT INTO trend_profile_labels_new (user_id, profile_id, display_name, note, updated_at)
        SELECT '{legacy}', profile_id, display_name, note, updated_at FROM trend_profile_labels;
        DROP TABLE trend_profile_labels;
        ALTER TABLE trend_profile_labels_new RENAME TO trend_profile_labels;
        """
    )


def _migrate_sqlite_schedules(conn: sqlite3.Connection, legacy: str) -> None:
    cols = _sqlite_table_columns(conn, "periodic_digest_schedules")
    if not cols or "user_id" in cols:
        return
    logger.info("Migrating sqlite periodic_digest_schedules: adding user_id")
    conn.execute(
        f"ALTER TABLE periodic_digest_schedules ADD COLUMN user_id TEXT NOT NULL DEFAULT '{legacy}'"
    )


def _postgres_table_columns(conn: PgConnection, table: str) -> set[str]:
    cur = conn.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        """,
        (table,),
    )
    return {str(r[0]) for r in cur.fetchall()}


def _migrate_postgres_digest_snapshots(conn: PgConnection, legacy: str) -> None:
    cols = _postgres_table_columns(conn, "digest_snapshots")
    if not cols:
        return
    if "user_id" in cols:
        return
    logger.info("Migrating postgres digest_snapshots: adding user_id")
    conn.execute(f"ALTER TABLE digest_snapshots ADD COLUMN user_id TEXT NOT NULL DEFAULT '{legacy}'")
    conn.execute(
        "ALTER TABLE digest_snapshots DROP CONSTRAINT IF EXISTS digest_snapshots_profile_id_period_key"
    )
    conn.execute(
        """
        DO $$ BEGIN
            ALTER TABLE digest_snapshots ADD CONSTRAINT digest_snapshots_user_profile_period_uq
                UNIQUE (user_id, profile_id, period);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
        """
    )


def _migrate_postgres_trend_labels(conn: PgConnection, legacy: str) -> None:
    cols = _postgres_table_columns(conn, "trend_profile_labels")
    if not cols:
        return
    if "user_id" in cols:
        return
    logger.info("Migrating postgres trend_profile_labels: adding user_id")
    conn.execute(f"ALTER TABLE trend_profile_labels ADD COLUMN user_id TEXT NOT NULL DEFAULT '{legacy}'")
    conn.execute("ALTER TABLE trend_profile_labels DROP CONSTRAINT IF EXISTS trend_profile_labels_pkey")
    conn.execute(
        f"""
        UPDATE trend_profile_labels SET user_id = '{legacy}' WHERE user_id IS NULL OR user_id = ''
        """
    )
    conn.execute(
        """
        ALTER TABLE trend_profile_labels ADD PRIMARY KEY (user_id, profile_id)
        """
    )


def _migrate_postgres_schedules(conn: PgConnection, legacy: str) -> None:
    cols = _postgres_table_columns(conn, "periodic_digest_schedules")
    if not cols or "user_id" in cols:
        return
    logger.info("Migrating postgres periodic_digest_schedules: adding user_id")
    conn.execute(
        f"ALTER TABLE periodic_digest_schedules ADD COLUMN user_id TEXT NOT NULL DEFAULT '{legacy}'"
    )


def _collect_profile_id_pairs(
    conn: sqlite3.Connection | PgConnection,
) -> set[tuple[str, str]]:
    backend = _backend_of_conn(conn)
    pairs: set[tuple[str, str]] = set()
    for row in conn.execute("SELECT DISTINCT user_id, profile_id FROM digest_snapshots"):
        pairs.add((str(row[0]), str(row[1])))
    for row in conn.execute("SELECT DISTINCT user_id, profile_id FROM periodic_digest_schedules"):
        pairs.add((str(row[0]), str(row[1])))
    if backend == "sqlite":
        assert isinstance(conn, sqlite3.Connection)
        if _sqlite_table_exists(conn, "trend_profile_labels"):
            for row in conn.execute("SELECT DISTINCT user_id, profile_id FROM trend_profile_labels"):
                pairs.add((str(row[0]), str(row[1])))
    else:
        if _postgres_table_exists(conn, "trend_profile_labels"):
            for row in conn.execute("SELECT DISTINCT user_id, profile_id FROM trend_profile_labels"):
                pairs.add((str(row[0]), str(row[1])))
    return pairs


def _load_trend_labels_map(
    conn: sqlite3.Connection | PgConnection,
) -> dict[tuple[str, str], tuple[str, str]]:
    backend = _backend_of_conn(conn)
    out: dict[tuple[str, str], tuple[str, str]] = {}
    if backend == "sqlite":
        assert isinstance(conn, sqlite3.Connection)
        if not _sqlite_table_exists(conn, "trend_profile_labels"):
            return out
        cur = conn.execute(
            "SELECT user_id, profile_id, display_name, COALESCE(note, '') FROM trend_profile_labels"
        )
    else:
        if not _postgres_table_exists(conn, "trend_profile_labels"):
            return out
        cur = conn.execute(
            "SELECT user_id, profile_id, display_name, COALESCE(note, '') FROM trend_profile_labels"
        )
    for row in cur.fetchall():
        out[(str(row[0]), str(row[1]))] = (str(row[2]), str(row[3]))
    return out


def migrate_digest_profiles_uuid_v1(conn: sqlite3.Connection | PgConnection) -> None:
    """Старые произвольные profile_id → UUID; trend_profile_labels → digest_profiles."""
    if _profiles_uuid_migration_done(conn):
        return
    backend = _backend_of_conn(conn)
    pairs = _collect_profile_id_pairs(conn)
    if not pairs:
        _mark_profiles_uuid_migration_done(conn)
        return

    labels_map = _load_trend_labels_map(conn)
    now = datetime.now(timezone.utc).isoformat()

    mapping: dict[tuple[str, str], str] = {}
    for uid, old_pid in pairs:
        new_pid = old_pid if _looks_like_uuid(old_pid) else stable_legacy_profile_uuid(uid, old_pid)
        mapping[(uid, old_pid)] = new_pid

    ph = _ph(backend)
    seen_profile_ids: set[str] = set()
    for (uid, old_pid), new_pid in mapping.items():
        if new_pid in seen_profile_ids:
            continue
        seen_profile_ids.add(new_pid)
        dname, note_v = labels_map.get((uid, old_pid), (old_pid, ""))
        dn = (dname or "").strip() or old_pid
        nv = (note_v or "").strip()
        if backend == "sqlite":
            conn.execute(
                f"""
                INSERT OR IGNORE INTO digest_profiles (profile_id, user_id, display_name, note, created_at, updated_at)
                VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph})
                """,
                (new_pid, uid, dn, nv, now, now),
            )
        else:
            conn.execute(
                """
                INSERT INTO digest_profiles (profile_id, user_id, display_name, note, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (profile_id) DO NOTHING
                """,
                (new_pid, uid, dn, nv, now, now),
            )

    for (uid, old_pid), new_pid in mapping.items():
        if old_pid == new_pid:
            continue
        conn.execute(
            f"UPDATE digest_snapshots SET profile_id = {ph} WHERE user_id = {ph} AND profile_id = {ph}",
            (new_pid, uid, old_pid),
        )
        conn.execute(
            f"UPDATE periodic_digest_schedules SET profile_id = {ph} WHERE user_id = {ph} AND profile_id = {ph}",
            (new_pid, uid, old_pid),
        )

    if backend == "sqlite":
        assert isinstance(conn, sqlite3.Connection)
        if _sqlite_table_exists(conn, "trend_profile_labels"):
            conn.execute("DROP TABLE trend_profile_labels")
    else:
        if _postgres_table_exists(conn, "trend_profile_labels"):
            conn.execute("DROP TABLE IF EXISTS trend_profile_labels")

    _mark_profiles_uuid_migration_done(conn)
    logger.info("digest_profiles UUID migration v1 applied (%s legacy keys)", len(pairs))


def ensure_multiuser_schema(conn: sqlite3.Connection | PgConnection) -> None:
    """Добавляет user_id и auth_users к уже существующим БД со старой схемой."""
    legacy = _legacy_id()
    backend = _backend_of_conn(conn)
    if backend == "sqlite":
        assert isinstance(conn, sqlite3.Connection)
        _migrate_sqlite_digest_snapshots(conn, legacy)
        _migrate_sqlite_trend_labels(conn, legacy)
        _migrate_sqlite_schedules(conn, legacy)
    else:
        assert not isinstance(conn, sqlite3.Connection)
        _migrate_postgres_digest_snapshots(conn, legacy)
        _migrate_postgres_trend_labels(conn, legacy)
        _migrate_postgres_schedules(conn, legacy)


def _ensure_saved_digest_share_columns(conn: sqlite3.Connection | PgConnection) -> None:
    backend = _backend_of_conn(conn)
    if backend == "sqlite":
        assert isinstance(conn, sqlite3.Connection)
        cols = _sqlite_table_columns(conn, "saved_digests")
        if not cols:
            return
        if "share_token" not in cols:
            logger.info("Migrating sqlite saved_digests: share columns")
            conn.execute("ALTER TABLE saved_digests ADD COLUMN share_token TEXT NULL")
            conn.execute("ALTER TABLE saved_digests ADD COLUMN share_created_at TEXT NULL")
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_digests_share_token "
            "ON saved_digests(share_token) WHERE share_token IS NOT NULL"
        )
    else:
        assert not isinstance(conn, sqlite3.Connection)
        cols = _postgres_table_columns(conn, "saved_digests")
        if not cols:
            return
        if "share_token" not in cols:
            logger.info("Migrating postgres saved_digests: share columns")
            conn.execute("ALTER TABLE saved_digests ADD COLUMN IF NOT EXISTS share_token TEXT NULL")
            conn.execute("ALTER TABLE saved_digests ADD COLUMN IF NOT EXISTS share_created_at TEXT NULL")
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_digests_share_token
            ON saved_digests(share_token) WHERE share_token IS NOT NULL
            """
        )


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


def _ensure_sqlite_auth_users(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )


def _ensure_sqlite_auth_refresh_sessions(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user ON auth_refresh_sessions(user_id)"
    )


def init_snapshot_schema(conn: sqlite3.Connection | PgConnection) -> None:
    backend = _backend_of_conn(conn)
    if backend == "sqlite":
        conn.executescript(CREATE_SQL_SQLITE)
        _ensure_sqlite_auth_users(conn)
        _ensure_sqlite_auth_refresh_sessions(conn)
    else:
        conn.execute(CREATE_SQL_POSTGRES_DIGEST)
        conn.execute(CREATE_SQL_POSTGRES_DIGEST_PROFILES)
        conn.execute(CREATE_SQL_POSTGRES_SCHEDULES)
        conn.execute(CREATE_SQL_POSTGRES_AUTH_USERS)
        conn.execute(CREATE_SQL_POSTGRES_AUTH_REFRESH)
        conn.execute(CREATE_SQL_POSTGRES_SAVED_DIGESTS)
        conn.execute(CREATE_SQL_POSTGRES_SCHEDULE_RUNS_TABLE)
        conn.execute(CREATE_SQL_POSTGRES_SCHEDULE_RUNS_INDEX)
    ensure_multiuser_schema(conn)
    _ensure_saved_digest_share_columns(conn)
    migrate_digest_profiles_uuid_v1(conn)


def fetch_latest_snapshot_before(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
    current_period: str,
) -> tuple[str, dict[str, Any]] | None:
    """Предыдущий снимок: максимальный period, лексикографически меньше current_period (YYYY-MM)."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT period, payload_json FROM digest_snapshots
        WHERE user_id = {ph} AND profile_id = {ph} AND period < {ph}
        ORDER BY period DESC
        LIMIT 1
    """
    row = conn.execute(sql, (user_id, profile_id, current_period)).fetchone()
    if not row:
        return None
    period, raw = row[0], row[1]
    return period, json.loads(raw)


def upsert_snapshot(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
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
            INSERT INTO digest_snapshots (user_id, profile_id, period, created_at, payload_json)
            VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
            ON CONFLICT(user_id, profile_id, period) DO UPDATE SET
                created_at = excluded.created_at,
                payload_json = excluded.payload_json
        """
    else:
        sql = f"""
            INSERT INTO digest_snapshots (user_id, profile_id, period, created_at, payload_json)
            VALUES ({ph}, {ph}, {ph}, {ph}, {ph})
            ON CONFLICT (user_id, profile_id, period) DO UPDATE SET
                created_at = EXCLUDED.created_at,
                payload_json = EXCLUDED.payload_json
        """
    conn.execute(sql, (user_id, profile_id, period, now, raw))


def _payload_topic_and_work_count(payload: dict[str, Any]) -> tuple[list[str], int]:
    raw_tq = payload.get("topic_queries")
    if isinstance(raw_tq, list):
        topic_queries = [str(x).strip() for x in raw_tq if str(x).strip()]
    else:
        topic_queries = []
    works = payload.get("works")
    work_count = len(works) if isinstance(works, list) else 0
    return topic_queries, work_count


def insert_digest_profile(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    display_name: str,
    note: str | None,
) -> tuple[str, str]:
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    nv = (note or "").strip()
    dn = display_name.strip()
    if not dn:
        raise ValueError("display_name пустой")
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    if backend == "sqlite":
        conn.execute(
            f"""
            INSERT INTO digest_profiles (profile_id, user_id, display_name, note, created_at, updated_at)
            VALUES ({ph}, {ph}, {ph}, {ph}, {ph}, {ph})
            """,
            (pid, user_id, dn, nv, now, now),
        )
    else:
        conn.execute(
            """
            INSERT INTO digest_profiles (profile_id, user_id, display_name, note, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (pid, user_id, dn, nv, now, now),
        )
    return pid, now


def digest_profile_exists_for_user(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
) -> bool:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    row = conn.execute(
        f"SELECT 1 FROM digest_profiles WHERE user_id = {ph} AND profile_id = {ph}",
        (user_id, profile_id),
    ).fetchone()
    return row is not None


def upsert_profile_label(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
    display_name: str,
    note: str | None,
) -> int:
    """Обновить подпись существующего профиля (digest_profiles). Возвращает число обновлённых строк."""
    now = datetime.now(timezone.utc).isoformat()
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    note_v = (note or "").strip()
    if backend == "sqlite":
        cur = conn.execute(
            f"""
            UPDATE digest_profiles SET display_name = {ph}, note = {ph}, updated_at = {ph}
            WHERE user_id = {ph} AND profile_id = {ph}
            """,
            (display_name.strip(), note_v, now, user_id, profile_id),
        )
        return int(cur.rowcount or 0)
    cur = conn.execute(
        """
        UPDATE digest_profiles SET display_name = %s, note = %s, updated_at = %s
        WHERE user_id = %s AND profile_id = %s
        """,
        (display_name.strip(), note_v, now, user_id, profile_id),
    )
    rc = cur.rowcount
    return int(rc) if rc is not None else 0


def list_profile_summaries(
    conn: sqlite3.Connection | PgConnection,
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    """Сводки по digest_profiles, в т.ч. без снимков; агрегаты по digest_snapshots."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    profile_where = ""
    snap_filter = ""
    exec_params: tuple[Any, ...] = ()
    if user_id is not None:
        profile_where = f"WHERE p.user_id = {ph}"
        snap_filter = f"WHERE user_id = {ph}"
        exec_params = (user_id, user_id, user_id)

    if backend == "sqlite":
        sql = f"""
            SELECT p.user_id, p.profile_id, p.display_name, p.note,
                   COALESCE(sc.cnt, 0), last.period, last.created_at, last.payload_json
            FROM digest_profiles p
            LEFT JOIN (
              SELECT user_id, profile_id, COUNT(*) AS cnt
              FROM digest_snapshots
              {snap_filter}
              GROUP BY user_id, profile_id
            ) sc ON p.user_id = sc.user_id AND p.profile_id = sc.profile_id
            LEFT JOIN (
              SELECT d.user_id, d.profile_id, d.period, d.created_at, d.payload_json
              FROM digest_snapshots d
              INNER JOIN (
                SELECT user_id, profile_id, MAX(period) AS mp
                FROM digest_snapshots
                {snap_filter}
                GROUP BY user_id, profile_id
              ) t ON d.user_id = t.user_id AND d.profile_id = t.profile_id AND d.period = t.mp
            ) last ON p.user_id = last.user_id AND p.profile_id = last.profile_id
            {profile_where}
            ORDER BY p.user_id, p.display_name COLLATE NOCASE
        """
    else:
        sql = f"""
            SELECT p.user_id, p.profile_id, p.display_name, p.note,
                   COALESCE(sc.cnt, 0), last.period, last.created_at, last.payload_json
            FROM digest_profiles p
            LEFT JOIN (
              SELECT user_id, profile_id, COUNT(*) AS cnt
              FROM digest_snapshots
              {snap_filter}
              GROUP BY user_id, profile_id
            ) sc ON p.user_id = sc.user_id AND p.profile_id = sc.profile_id
            LEFT JOIN (
              SELECT d.user_id, d.profile_id, d.period, d.created_at, d.payload_json
              FROM digest_snapshots d
              INNER JOIN (
                SELECT user_id, profile_id, MAX(period) AS mp
                FROM digest_snapshots
                {snap_filter}
                GROUP BY user_id, profile_id
              ) t ON d.user_id = t.user_id AND d.profile_id = t.profile_id AND d.period = t.mp
            ) last ON p.user_id = last.user_id AND p.profile_id = last.profile_id
            {profile_where}
            ORDER BY p.user_id, p.display_name
        """

    if exec_params:
        cur = conn.execute(sql, exec_params)
    else:
        cur = conn.execute(sql)

    rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        uid, profile_id, display_name, note, cnt, period, created_at, raw_payload = row
        payload: dict[str, Any] = {}
        if raw_payload is not None:
            try:
                payload = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
            except json.JSONDecodeError:
                payload = {}
        if not isinstance(payload, dict):
            payload = {}
        tq, wc = _payload_topic_and_work_count(payload)
        out.append(
            {
                "user_id": uid,
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


def fetch_snapshot_for_period(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
    period: str,
) -> tuple[str, dict[str, Any]] | None:
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT created_at, payload_json FROM digest_snapshots
        WHERE user_id = {ph} AND profile_id = {ph} AND period = {ph}
        LIMIT 1
    """
    row = conn.execute(sql, (user_id, profile_id, period)).fetchone()
    if not row:
        return None
    created_at, raw = row[0], row[1]
    try:
        payload = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    return str(created_at), payload


def delete_digest_profile(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
) -> bool:
    """Удаляет профиль, его снимки и расписания. Возвращает True, если профиль существовал."""
    if not digest_profile_exists_for_user(conn, user_id, profile_id):
        return False
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    conn.execute(
        f"DELETE FROM digest_snapshots WHERE user_id = {ph} AND profile_id = {ph}",
        (user_id, profile_id),
    )
    conn.execute(
        f"DELETE FROM periodic_digest_schedules WHERE user_id = {ph} AND profile_id = {ph}",
        (user_id, profile_id),
    )
    conn.execute(
        f"DELETE FROM digest_profiles WHERE user_id = {ph} AND profile_id = {ph}",
        (user_id, profile_id),
    )
    return True


def list_period_metrics_for_profile(
    conn: sqlite3.Connection | PgConnection,
    user_id: str,
    profile_id: str,
) -> list[dict[str, Any]]:
    """Хронология снимков по profile_id: размер топа (works), дельта к прошлому периоду."""
    backend = _backend_of_conn(conn)
    ph = _ph(backend)
    sql = f"""
        SELECT period, created_at, payload_json FROM digest_snapshots
        WHERE user_id = {ph} AND profile_id = {ph}
        ORDER BY period ASC
    """
    cur = conn.execute(sql, (user_id, profile_id))
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
