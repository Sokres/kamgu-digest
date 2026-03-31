from sources.openalex import build_openalex_filter


def test_filter_article_and_year_range():
    f = build_openalex_filter(
        peer_reviewed_only=True,
        from_year=2020,
        to_year=2024,
        openalex_concept_id=None,
        openalex_source_ids=[],
    )
    assert f is not None
    assert "type:article" in f
    assert "publication_year:2020-2024" in f


def test_concept_normalized():
    f = build_openalex_filter(
        peer_reviewed_only=False,
        from_year=None,
        to_year=None,
        openalex_concept_id="C123456789",
        openalex_source_ids=[],
    )
    assert "concepts.id:https://openalex.org/C123456789" in (f or "")
