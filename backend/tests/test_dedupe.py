from pipeline.dedupe import dedupe_publications, normalize_doi
from digest.models import PublicationInput


def test_normalize_doi_strips_prefix():
    assert normalize_doi("https://doi.org/10.1000/xyz") == "10.1000/xyz"
    assert normalize_doi("  10.1000/abc  ") == "10.1000/abc"


def test_dedupe_prefers_longer_abstract_for_same_doi():
    a = PublicationInput(title="Same", doi="10.1/x", abstract="short", source="openalex")
    b = PublicationInput(title="Same", doi="10.1/x", abstract="longer abstract here", source="ss")
    out = dedupe_publications([a, b], set())
    assert len(out) == 1
    assert out[0].abstract == "longer abstract here"


def test_exclude_doi():
    p = PublicationInput(title="X", doi="10.1/excluded", source="oa")
    out = dedupe_publications([p], {"10.1/excluded"})
    assert out == []


def test_title_dedupe_without_doi():
    a = PublicationInput(title="Hello World!", source="oa")
    b = PublicationInput(title="hello world", source="ss")
    out = dedupe_publications([a, b], set())
    assert len(out) == 1
