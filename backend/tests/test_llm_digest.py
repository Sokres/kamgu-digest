"""Лимиты текста в промпте LLM и оценка размера payload."""

from digest.config import settings
from digest.models import ArticleCard, DigestLLMResult, PublicationInput
from pipeline.llm import (
    _abstract_chars_limit,
    _abstract_excerpt,
    _abstract_text_kind,
    _ensure_card_summaries,
    _estimate_digest_payload_chars,
    _finalize_digest_result,
    _merge_map_summaries_into_cards,
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


def test_abstract_excerpt_truncates_at_word_boundary() -> None:
    text = "word " * 200
    excerpt = _abstract_excerpt(text, max_chars=600)
    assert len(excerpt) <= 601
    assert excerpt.endswith("…")


def test_merge_map_summaries_fills_empty_card_summaries() -> None:
    result = DigestLLMResult(
        article_cards=[
            ArticleCard(title="Paper A", bullets=["only bullet"]),
        ]
    )
    paper_summaries = [
        {
            "title": "Paper A",
            "summary_ru": "Русское описание статьи.",
            "summary_en": "English article summary.",
            "bullets_ru": ["тезис 1", "тезис 2"],
            "why_relevant": "Связано с темой.",
        }
    ]
    merged = _merge_map_summaries_into_cards(result, paper_summaries)
    card = merged.article_cards[0]
    assert card.summary_ru == "Русское описание статьи."
    assert card.summary_en == "English article summary."
    assert card.bullets == ["only bullet"]
    assert card.why_relevant == "Связано с темой."


def test_ensure_card_summaries_uses_abstract_fallback() -> None:
    abstract = "This study investigates novel methods for material synthesis and reports improved yields."
    result = DigestLLMResult(
        article_cards=[ArticleCard(title="Paper B", bullets=["point"])],
    )
    pubs = [PublicationInput(title="Paper B", abstract=abstract)]
    ensured = _ensure_card_summaries(result, pubs)
    card = ensured.article_cards[0]
    assert card.summary_en == abstract
    assert card.summary_ru == ""


def test_finalize_digest_result_merges_then_falls_back() -> None:
    long_abstract = "A" * 800
    result = DigestLLMResult(
        article_cards=[ArticleCard(title="Paper C", bullets=[])],
    )
    paper_summaries = [
        {
            "title": "Paper C",
            "summary_ru": "",
            "summary_en": "",
            "bullets_ru": ["b1"],
        }
    ]
    pubs = [PublicationInput(title="Paper C", abstract=long_abstract)]
    final = _finalize_digest_result(result, pubs, paper_summaries)
    card = final.article_cards[0]
    assert card.bullets == ["b1"]
    assert len(card.summary_en) <= 601
    assert card.summary_en.endswith("…")
