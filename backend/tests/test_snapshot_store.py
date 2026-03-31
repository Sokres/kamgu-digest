import json
import tempfile
from pathlib import Path

from digest.snapshot_store import (
    fetch_latest_snapshot_before,
    init_snapshot_schema,
    snapshot_connection,
    upsert_snapshot,
)


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
            upsert_snapshot(conn, "energy", "2025-01", payload_v1)
            upsert_snapshot(conn, "energy", "2025-02", payload_v2)

        with snapshot_connection(url) as conn:
            prev = fetch_latest_snapshot_before(conn, "energy", "2025-03")
            assert prev is not None
            period, data = prev
            assert period == "2025-02"
            assert data["works"][0]["title"] == "New"

            older = fetch_latest_snapshot_before(conn, "energy", "2025-02")
            assert older is not None
            assert older[0] == "2025-01"


def test_upsert_same_period_replaces():
    with tempfile.TemporaryDirectory() as td:
        db_path = str(Path(td) / "sn.db")
        url = f"sqlite:///{db_path}"
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            upsert_snapshot(conn, "p", "2025-04", {"a": 1})
            upsert_snapshot(conn, "p", "2025-04", {"a": 2})
        with snapshot_connection(url) as conn:
            row = conn.execute(
                "SELECT payload_json FROM digest_snapshots WHERE profile_id=? AND period=?",
                ("p", "2025-04"),
            ).fetchone()
            assert row is not None
            assert json.loads(row[0])["a"] == 2
