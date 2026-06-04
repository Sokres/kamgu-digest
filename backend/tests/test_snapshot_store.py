import json
import tempfile
from pathlib import Path

from digest.snapshot_store import (
    delete_digest_profile,
    digest_profile_exists_for_user,
    fetch_latest_snapshot_before,
    fetch_snapshot_for_period,
    init_snapshot_schema,
    insert_digest_profile,
    list_period_metrics_for_profile,
    list_profile_summaries,
    migrate_digest_profiles_uuid_v1,
    snapshot_connection,
    stable_legacy_profile_uuid,
    upsert_snapshot,
)

_LEGACY = "__legacy__"


def test_upsert_and_fetch_previous_period():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        uid = _LEGACY
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            pid, _ = insert_digest_profile(conn, uid, "Test direction", None)
        payload_v1 = {
            "version": 1,
            "works": [{"dedupe_key": "doi:x", "title": "Old", "rank": 1}],
        }
        payload_v2 = {
            "version": 1,
            "works": [{"dedupe_key": "doi:y", "title": "New", "rank": 1}],
        }
        with snapshot_connection(url) as conn:
            upsert_snapshot(conn, uid, pid, "2025-01", payload_v1)
            upsert_snapshot(conn, uid, pid, "2025-02", payload_v2)

        with snapshot_connection(url) as conn:
            prev = fetch_latest_snapshot_before(conn, uid, pid, "2025-03")
            assert prev is not None
            period, data = prev
            assert period == "2025-02"
            assert data["works"][0]["title"] == "New"

            older = fetch_latest_snapshot_before(conn, uid, pid, "2025-02")
            assert older is not None
            assert older[0] == "2025-01"


def test_upsert_same_period_replaces():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        uid = _LEGACY
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            pid, _ = insert_digest_profile(conn, uid, "P", None)
            upsert_snapshot(conn, uid, pid, "2025-04", {"a": 1})
            upsert_snapshot(conn, uid, pid, "2025-04", {"a": 2})
        with snapshot_connection(url) as conn:
            row = conn.execute(
                "SELECT payload_json FROM digest_snapshots WHERE user_id=? AND profile_id=? AND period=?",
                (uid, pid, "2025-04"),
            ).fetchone()
            assert row is not None
            assert json.loads(row[0])["a"] == 2


def test_list_summaries_and_series_and_label():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        uid = _LEGACY
        p1 = {
            "version": 1,
            "topic_queries": ["solar"],
            "works": [{"dedupe_key": "doi:x", "title": "A", "rank": 1}],
        }
        p2 = {
            "version": 1,
            "topic_queries": ["solar"],
            "works": [
                {"dedupe_key": "doi:y", "title": "B", "rank": 1},
                {"dedupe_key": "doi:z", "title": "C", "rank": 2},
            ],
        }
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            pid, _ = insert_digest_profile(conn, uid, "Энергетика", "тест")
            upsert_snapshot(conn, uid, pid, "2025-01", p1)
            upsert_snapshot(conn, uid, pid, "2025-02", p2)

        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            summaries = list_profile_summaries(conn)
            assert len(summaries) == 1
            s0 = summaries[0]
            assert s0["profile_id"] == pid
            assert s0["snapshot_count"] == 2
            assert s0["last_period"] == "2025-02"
            assert s0["work_count_last"] == 2
            assert s0["display_name"] == "Энергетика"
            assert s0["note"] == "тест"

            series = list_period_metrics_for_profile(conn, uid, pid)
            assert len(series) == 2
            assert series[0]["work_count"] == 1
            assert series[1]["work_count"] == 2
            assert series[1]["delta_vs_prev"] == 1
            assert series[1]["pct_change_vs_prev"] == 100.0


def test_legacy_profile_id_migrates_to_uuid():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        uid = _LEGACY
        old_pid = "energy"
        new_pid = stable_legacy_profile_uuid(uid, old_pid)
        pl = {"version": 1, "topic_queries": ["q"], "works": []}
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            conn.execute("DELETE FROM app_schema_meta WHERE k = ?", ("profiles_uuid_v1",))
            upsert_snapshot(conn, uid, old_pid, "2025-01", pl)
        with snapshot_connection(url) as conn:
            migrate_digest_profiles_uuid_v1(conn)
            row = conn.execute(
                "SELECT profile_id FROM digest_snapshots WHERE user_id=? AND period=?",
                (uid, "2025-01"),
            ).fetchone()
            assert row is not None
            assert row[0] == new_pid
            assert digest_profile_exists_for_user(conn, uid, new_pid)


def test_fetch_snapshot_for_period_and_delete_profile():
    with tempfile.TemporaryDirectory() as td:
        url = f"sqlite:///{Path(td) / 'sn.db'}"
        uid = _LEGACY
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            pid, _ = insert_digest_profile(conn, uid, "Del test", None)
        payload = {
            "version": 1,
            "topic_queries": ["solar"],
            "works": [{"dedupe_key": "k1", "title": "A", "rank": 1}],
            "digest_ru": "RU text",
            "digest_en": "EN text",
        }
        with snapshot_connection(url) as conn:
            upsert_snapshot(conn, uid, pid, "2025-04", payload)
        with snapshot_connection(url) as conn:
            row = fetch_snapshot_for_period(conn, uid, pid, "2025-04")
            assert row is not None
            created_at, data = row
            assert data["digest_ru"] == "RU text"
            assert created_at
            assert delete_digest_profile(conn, uid, pid) is True
            assert fetch_snapshot_for_period(conn, uid, pid, "2025-04") is None
            assert digest_profile_exists_for_user(conn, uid, pid) is False
