import tempfile
from pathlib import Path

from digest.models import MonthlyStructuredDelta, WorkCitationDelta
from digest.snapshot_store import init_snapshot_schema, insert_digest_profile, snapshot_connection, upsert_snapshot
from digest.trend_aggregates import build_trend_highlights, list_snapshot_rows_for_profile

_LEGACY = "__legacy__"


def _payload(
    *,
    period_works: list[dict],
    structured: dict | None = None,
    digest_ru: str = "",
) -> dict:
    body: dict = {
        "version": 1,
        "topic_queries": ["solar energy"],
        "works": period_works,
    }
    if structured is not None:
        body["structured_delta"] = structured
    if digest_ru:
        body["digest_ru"] = digest_ru
    return body


def test_build_trend_highlights_aggregates_periods():
    with tempfile.TemporaryDirectory() as td:
        url = f"sqlite:///{Path(td) / 'agg.db'}"
        uid = _LEGACY
        delta2 = MonthlyStructuredDelta(
            profile_id="p",
            current_period="2025-02",
            compared_period="2025-01",
            is_baseline=False,
            entered_top_k=[
                WorkCitationDelta(
                    dedupe_key="k2",
                    title="Paper B",
                    citation_delta=3,
                    rank_current=1,
                )
            ],
            left_top_k=[],
            top_by_citation_gain=[
                WorkCitationDelta(
                    dedupe_key="k1",
                    title="Paper A",
                    citation_delta=5,
                    rank_previous=1,
                    rank_current=2,
                )
            ],
            concept_share_deltas=[],
        ).model_dump()
        with snapshot_connection(url) as conn:
            init_snapshot_schema(conn)
            pid, _ = insert_digest_profile(conn, uid, "Test", None)
            upsert_snapshot(
                conn,
                uid,
                pid,
                "2025-01",
                _payload(
                    period_works=[
                        {
                            "dedupe_key": "k1",
                            "title": "Paper A",
                            "rank": 1,
                            "concepts": [{"display_name": "Solar", "score": 0.9}],
                        }
                    ],
                    structured={
                        "profile_id": pid,
                        "current_period": "2025-01",
                        "is_baseline": True,
                    },
                ),
            )
            upsert_snapshot(
                conn,
                uid,
                pid,
                "2025-02",
                _payload(
                    period_works=[
                        {
                            "dedupe_key": "k1",
                            "title": "Paper A",
                            "rank": 2,
                            "concepts": [{"display_name": "Solar", "score": 0.9}],
                        },
                        {
                            "dedupe_key": "k2",
                            "title": "Paper B",
                            "rank": 1,
                            "concepts": [{"display_name": "Battery", "score": 0.8}],
                        },
                    ],
                    structured=delta2,
                    digest_ru="Тестовый дайджест",
                ),
            )
            rows = list_snapshot_rows_for_profile(conn, uid, pid)

        result = build_trend_highlights(pid, rows)
        assert result.profile_id == pid
        assert result.topic_queries == ["solar energy"]
        assert len(result.points) == 2
        assert result.points[0].is_baseline is True
        assert result.points[1].entered_count == 1
        assert result.points[1].top_citation_gain is not None
        assert result.points[1].top_citation_gain.delta == 5
        assert result.latest_snapshot is not None
        assert result.latest_snapshot.digest_ru == "Тестовый дайджест"
        assert len(result.concept_evolution) == 2
