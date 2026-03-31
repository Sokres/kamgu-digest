from digest.models import DigestRequest


def test_year_zero_treated_as_unset():
    r = DigestRequest(topic_queries=["q"], from_year=0, to_year=0)
    assert r.from_year is None
    assert r.to_year is None


def test_valid_years_preserved():
    r = DigestRequest(topic_queries=["q"], from_year=2020, to_year=2024)
    assert r.from_year == 2020
    assert r.to_year == 2024
