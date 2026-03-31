from digest.models import ConceptRef, SnapshotWorkRecord
from pipeline.monthly_diff import (
    aggregate_concept_shares,
    compute_monthly_structured_delta,
)


def _w(
    key: str,
    title: str,
    rank: int,
    cites: int | None,
    concepts: list[ConceptRef] | None = None,
) -> SnapshotWorkRecord:
    return SnapshotWorkRecord(
        dedupe_key=key,
        title=title,
        year=2024,
        citation_count=cites,
        rank=rank,
        concepts=concepts or [],
    )


def test_citation_gain_ranking_and_entered_left():
    prev = [
        _w("doi:a", "A", 1, 100),
        _w("doi:b", "B", 2, 90),
        _w("doi:c", "C", 3, 80),
    ]
    curr = [
        _w("doi:b", "B", 1, 110),
        _w("doi:d", "D", 2, 50),
        _w("doi:a", "A", 3, 105),
    ]
    d = compute_monthly_structured_delta(
        profile_id="p",
        current_period="2025-03",
        compared_period="2025-02",
        is_baseline=False,
        previous_works=prev,
        current_works=curr,
        trend_top_k=3,
    )
    assert d.is_baseline is False
    assert d.compared_period == "2025-02"
    keys_gain = {x.dedupe_key for x in d.top_by_citation_gain}
    assert "doi:b" in keys_gain
    assert "doi:a" in keys_gain
    entered_keys = {x.dedupe_key for x in d.entered_top_k}
    left_keys = {x.dedupe_key for x in d.left_top_k}
    assert "doi:d" in entered_keys
    assert "doi:c" in left_keys


def test_baseline_no_concept_shares():
    curr = [_w("doi:x", "X", 1, 10)]
    d = compute_monthly_structured_delta(
        profile_id="p",
        current_period="2025-03",
        compared_period=None,
        is_baseline=True,
        previous_works=None,
        current_works=curr,
        trend_top_k=5,
    )
    assert d.concept_share_deltas == []


def test_aggregate_concept_shares():
    works = [
        _w(
            "k1",
            "t1",
            1,
            1,
            [
                ConceptRef(display_name="Solar", score=0.9),
                ConceptRef(display_name="Wind", score=0.5),
            ],
        ),
        _w(
            "k2",
            "t2",
            2,
            1,
            [ConceptRef(display_name="Solar", score=0.8)],
        ),
    ]
    sh = aggregate_concept_shares(works)
    assert sh["Solar"] == 1.0
    assert abs(sh["Wind"] - 0.5) < 1e-6
