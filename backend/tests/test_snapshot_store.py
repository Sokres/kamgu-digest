import json
import tempfile
from pathlib import Path

from digest.snapshot_store import (
    fetch_latest_snapshot_before,
    init_snapshot_schema,
    list_period_metrics_for_profile,
    list_profile_summaries,
    snapshot_connection,
    upsert_profile_label,
    upsert_snapshot,
)

_LEGACY = "__legacy__"


def test_upsert_and_fetch_previous_period():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        payload_v1 = {
            "version": 1,
            "works": [{"dedupe_key": "doi:x", "title": "Old", "rank": 1}],
        }
        payload_v2 = {
            "version": 1,
            "works": [{"dedupe_key": "doi:y", "title": "New", "rank": 1}],
        }
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            upsert_snapshot(conn, _LEGACY, "energy", "2025-01", payload_v1)
            upsert_snapshot(conn, _LEGACY, "energy", "2025-02", payload_v2)

        with snapshot_connection(url) as conn:
            prev = fetch_latest_snapshot_before(conn, _LEGACY, "energy", "2025-03")
            assert prev is not None
            period, data = prev
            assert period == "2025-02"
            assert data["works"][0]["title"] == "New"

            older = fetch_latest_snapshot_before(conn, _LEGACY, "energy", "2025-02")
            assert older is not None
            assert older[0] == "2025-01"


def test_upsert_same_period_replaces():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            upsert_snapshot(conn, _LEGACY, "p", "2025-04", {"a": 1})
            upsert_snapshot(conn, _LEGACY, "p", "2025-04", {"a": 2})
        with snapshot_connection(url) as conn:
            row = conn.execute(
                "SELECT payload_json FROM digest_snapshots WHERE user_id=? AND profile_id=? AND period=?",
                (_LEGACY, "p", "2025-04"),
            ).fetchone()
            assert row is not None
            assert json.loads(row[0])["a"] == 2


def test_list_summaries_and_series_and_label():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
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
            upsert_snapshot(conn, _LEGACY, "energy", "2025-01", p1)
            upsert_snapshot(conn, _LEGACY, "energy", "2025-02", p2)
            upsert_profile_label(conn, _LEGACY, "energy", "Энергетика", "тест")

        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            summaries = list_profile_summaries(conn)
            assert len(summaries) == 1
            s0 = summaries[0]
            assert s0["profile_id"] == "energy"
            assert s0["snapshot_count"] == 2
            assert s0["last_period"] == "2025-02"
            assert s0["work_count_last"] == 2
            assert s0["display_name"] == "Энергетика"
            assert s0["note"] == "тест"

            series = list_period_metrics_for_profile(conn, _LEGACY, "energy")
            assert len(series) == 2
            assert series[0]["work_count"] == 1
            assert series[1]["work_count"] == 2
            assert series[1]["delta_vs_prev"] == 1
            assert series[1]["pct_change_vs_prev"] == 100.0
