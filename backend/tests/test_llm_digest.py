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
    long_abstract = "A" * 1500
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
    assert len(card.summary_en) <= 1201
    assert card.summary_en.endswith("…")


def test_finalize_builds_cards_from_paper_summaries_when_empty() -> None:
    result = DigestLLMResult(overview_ru="обзор", article_cards=[])
    paper_summaries = [
        {
            "title": "Paper D",
            "url": "https://example.com/d",
            "year": 2020,
            "summary_ru": "Кратко по-русски.",
            "summary_en": "Short in English.",
            "bullets_ru": ["a", "b"],
            "why_relevant": "Релевантно.",
        }
    ]
    pubs = [PublicationInput(title="Paper D", url="https://example.com/d", year=2020)]
    final = _finalize_digest_result(result, pubs, paper_summaries)
    assert len(final.article_cards) == 1
    card = final.article_cards[0]
    assert card.title == "Paper D"
    assert card.summary_ru == "Кратко по-русски."
    assert card.summary_en == "Short in English."
    assert card.bullets == ["a", "b"]
    assert card.why_relevant == "Релевантно."


def test_generate_digest_llm_two_stage_when_pubs_ge_min(monkeypatch) -> None:
    import asyncio

    from pipeline import llm as llm_mod

    monkeypatch.setattr(settings, "llm_digest_two_stage_min_pubs", 8)
    monkeypatch.setattr(settings, "llm_digest_prompt_budget_chars", 900_000)

    called: dict[str, bool] = {"two_stage": False, "single": False}

    async def fake_two_stage(publications, topic_queries):
        called["two_stage"] = True
        return DigestLLMResult(overview_ru="ok")

    async def fake_chat(_system, _payload):
        called["single"] = True
        return {"overview_ru": "single"}

    monkeypatch.setattr(llm_mod, "_generate_digest_llm_two_stage", fake_two_stage)
    monkeypatch.setattr(llm_mod, "_chat_json_to_dict", fake_chat)

    pubs = [PublicationInput(title=f"P{i}", abstract="a") for i in range(20)]
    result, used_two_stage = asyncio.run(llm_mod.generate_digest_llm(pubs, ["topic"]))
    assert used_two_stage is True
    assert called["two_stage"] is True
    assert called["single"] is False
    assert result.overview_ru == "ok"


def test_generate_digest_llm_single_when_few_pubs(monkeypatch) -> None:
    import asyncio

    from pipeline import llm as llm_mod

    monkeypatch.setattr(settings, "llm_digest_two_stage_min_pubs", 8)
    monkeypatch.setattr(settings, "llm_digest_prompt_budget_chars", 900_000)

    called: dict[str, bool] = {"two_stage": False}

    async def fake_two_stage(publications, topic_queries):
        called["two_stage"] = True
        return DigestLLMResult(overview_ru="two")

    async def fake_chat(_system, _payload):
        return {
            "overview_ru": "single",
            "overview_en": "",
            "digest_ru": "",
            "digest_en": "",
            "article_cards": [],
        }

    monkeypatch.setattr(llm_mod, "_generate_digest_llm_two_stage", fake_two_stage)
    monkeypatch.setattr(llm_mod, "_chat_json_to_dict", fake_chat)

    pubs = [PublicationInput(title=f"P{i}", abstract="a") for i in range(3)]
    result, used_two_stage = asyncio.run(llm_mod.generate_digest_llm(pubs, ["topic"]))
    assert used_two_stage is False
    assert called["two_stage"] is False
    assert result.overview_ru == "single"
