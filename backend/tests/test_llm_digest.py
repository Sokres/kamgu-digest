"""Лимиты текста в промпте LLM и оценка размера payload."""

from digest.config import settings
from digest.models import PublicationInput
from pipeline.llm import (
    _abstract_chars_limit,
    _abstract_text_kind,
    _estimate_digest_payload_chars,
    _pub_dict,
)


def test_abstract_text_kind() -> None:
    assert _abstract_text_kind(PublicationInput(title="a", source="user_pdf")) == "pdf_excerpt"
    assert _abstract_text_kind(PublicationInput(title="a", source="oa_fulltext")) == "oa_fulltext_excerpt"
    assert _abstract_text_kind(PublicationInput(title="a", source="openalex")) == "metadata_abstract"


def test_pub_dict_respects_limits(monkeypatch) -> None:
    long = "x" * 100_000
    meta = PublicationInput(title="t", abstract=long, source="openalex")
    d_meta = _pub_dict(meta)
    assert len(d_meta["abstract"]) == settings.llm_max_abstract_chars_per_pub
    assert d_meta["abstract_text_kind"] == "metadata_abstract"

    pdf = PublicationInput(title="t", abstract=long, source="user_pdf")
    d_pdf = _pub_dict(pdf)
    assert len(d_pdf["abstract"]) == settings.llm_max_abstract_chars_longtext


def test_estimate_digest_payload_grows_with_abstracts() -> None:
    pubs = [
        PublicationInput(title=f"p{i}", abstract="word " * 500, source="openalex")
        for i in range(5)
    ]
    a = _estimate_digest_payload_chars(pubs, ["q"])
    b = _estimate_digest_payload_chars(
        [PublicationInput(title=p.title, abstract=p.abstract * 2, source=p.source) for p in pubs],
        ["q"],
    )
    assert b > a


def test_abstract_chars_limit_matches_source(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_max_abstract_chars_per_pub", 100)
    monkeypatch.setattr(settings, "llm_max_abstract_chars_longtext", 200)
    assert _abstract_chars_limit(PublicationInput(title="a", source="openalex")) == 100
    assert _abstract_chars_limit(PublicationInput(title="a", source="user_pdf")) == 200
    assert _abstract_chars_limit(PublicationInput(title="a", source="oa_fulltext")) == 200
