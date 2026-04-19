import asyncio
import json
import logging
import random
import re
import time
from typing import Any

from openai import AsyncOpenAI, RateLimitError
from pydantic import ValidationError

from digest.config import settings
from digest.models import DigestLLMResult, MonthlyStructuredDelta, PublicationInput

logger = logging.getLogger(__name__)

SYSTEM = """You are a research assistant producing digests for a lab.
Rules:
- Use ONLY the provided publication fields (title, year, url, doi, abstract; optional is_open_access, oa_url). The field abstract_text_kind tells you what "abstract" contains: metadata_abstract (journal abstract), pdf_excerpt (first pages from a user PDF), or oa_fulltext_excerpt (longer excerpt from an open-access PDF). For excerpts, focus on visible content only; do not infer unseen parts of the paper.
- Do not invent methods, results, numbers, or citations not supported by the provided text.
- If abstract is empty, base bullets only on the title and state uncertainty briefly.
- Respond with a single JSON object, no markdown fences.
JSON shape:
{
  "overview_ru": "2-4 sentences",
  "overview_en": "2-4 sentences",
  "digest_ru": "Markdown: sections Overview, Theme clusters (if clear), Highlights per paper",
  "digest_en": "Same structure in English",
  "article_cards": [
    {
      "title": "must match an input title exactly",
      "url": "from input or empty",
      "year": null,
      "bullets": ["2-3 short points"],
      "why_relevant": "one sentence tied to the user's topics"
    }
  ]
}
Include one article_card per input publication, in the same order as given."""

SYSTEM_MAP_PAPER = """You analyze ONE publication record for a research lab digest.
The "abstract" field may be a journal abstract (metadata_abstract), text from the first pages of a PDF (pdf_excerpt), or a longer excerpt from an open-access PDF (oa_fulltext_excerpt) — see abstract_text_kind.
Rules:
- Use ONLY the provided publication fields. Do not invent statistics, methods, or results not supported by the text.
- If the text is short or empty, say so briefly and stay conservative.
- Respond with a single JSON object, no markdown fences.
JSON shape:
{
  "title_match": "must equal the input title exactly",
  "summary_ru": "3-6 sentences: goal, approach if visible, main point or limitation",
  "summary_en": "same in English",
  "bullets_ru": ["2-4 short points grounded in the text"],
  "bullets_en": ["2-4 short points in English"],
  "why_relevant": "one sentence tying the paper to the user topics"
}"""

SYSTEM_REDUCE = """You synthesize a research digest from per-paper summaries only (the full text was already summarized per paper).
Rules:
- Use ONLY paper_summaries and topics. Do not invent statistics, DOIs, or claims not present in the summaries.
- article_cards: "title" must match each paper_summaries[].title exactly, in the same order as given.
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "2-4 sentences",
  "overview_en": "2-4 sentences",
  "digest_ru": "Markdown: sections Overview, Theme clusters (if clear), Highlights per paper",
  "digest_en": "Same structure in English",
  "article_cards": [
    {
      "title": "must match an input title exactly",
      "url": "from paper_summaries or empty",
      "year": null,
      "bullets": ["2-3 short points from summaries"],
      "why_relevant": "one sentence tied to the user's topics"
    }
  ]
}
Include one article_card per paper_summaries entry, in the same order as given."""

SYSTEM_WEB = """You summarize WEB SEARCH SNIPPETS for a research lab (not peer-reviewed literature).
Rules:
- This is NOT a systematic review or a catalog of journal articles. Treat each item as a web page with a short excerpt.
- Use ONLY facts and phrasing supported by the provided snippets. Do not invent statistics, paper titles, DOIs, or journal names not present in snippets.
- If information is missing or uncertain, say so briefly.
- article_cards: "title" must match a snippet title exactly; "url" from that snippet.
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "2-4 sentences; mention web-snippet limitation",
  "overview_en": "2-4 sentences",
  "digest_ru": "Markdown: start with a short disclaimer that this is web search snippets, then themes and per-source highlights",
  "digest_en": "Same in English",
  "article_cards": [
    {
      "title": "must match an input snippet title exactly",
      "url": "from snippet",
      "year": null,
      "bullets": ["2-3 short points from snippet only"],
      "why_relevant": "one sentence"
    }
  ]
}
Include one article_card per input snippet, in the same order as given."""



SYSTEM_MONTHLY = """You are a research assistant writing a MONTHLY trend digest for a research lab.
Rules:
- Use ONLY facts present in structured_delta and publication fields (title, year, url, doi, abstract, abstract_text_kind, optional concept names). abstract_text_kind indicates metadata_abstract vs pdf_excerpt vs oa_fulltext_excerpt. Do not invent citation counts, ranks, or concept shares.
- If is_baseline is true, state clearly that this is the first stored snapshot and month-to-month comparisons are unavailable; still summarize current papers.
- In digest_ru and digest_en, use Markdown with these sections in order:
  1) **Disclaimer** (one short paragraph): metrics come from snapshot comparisons of this corpus; citation data lag; "popularity" means citation change / rank within this sample, not definitive global impact.
  2) **Observed metric shifts** — only quantitative/tabular facts from structured_delta (top citation gains, entered/left top-K, concept share deltas). If a list is empty, say so briefly.
  3) **Current highlights** — thematic clusters and paper summaries from abstracts.
  4) **Risks and discussion hypotheses** — clearly label as hypotheses and questions for expert discussion, NOT as facts or firm predictions about the field going "wrong".
- If abstract is empty, base bullets only on the title and note uncertainty briefly.
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "2-4 sentences",
  "overview_en": "2-4 sentences",
  "digest_ru": "Markdown sections as above",
  "digest_en": "Same structure in English",
  "article_cards": [ ... one per input publication, same order ... ]
}
Include one article_card per input publication, in the same order as given."""

SYSTEM_REDUCE_MONTHLY = """You are a research assistant writing a MONTHLY trend digest for a research lab.
You receive structured_delta (metric comparisons between snapshots) and paper_summaries (short per-paper notes derived from abstracts or excerpts, not full papers).
Rules:
- Use ONLY facts present in structured_delta and paper_summaries. Do not invent citation counts, ranks, or concept shares — quantitative claims must come from structured_delta.
- If is_baseline is true, state clearly that this is the first stored snapshot and month-to-month comparisons are unavailable; still summarize current papers from paper_summaries.
- In digest_ru and digest_en, use Markdown with these sections in order:
  1) **Disclaimer** (one short paragraph): metrics come from snapshot comparisons of this corpus; citation data lag; "popularity" means citation change / rank within this sample, not definitive global impact.
  2) **Observed metric shifts** — only quantitative/tabular facts from structured_delta (top citation gains, entered/left top-K, concept share deltas). If a list is empty, say so briefly.
  3) **Current highlights** — thematic clusters and paper points from paper_summaries.
  4) **Risks and discussion hypotheses** — clearly label as hypotheses and questions for expert discussion, NOT as facts or firm predictions about the field going "wrong".
- article_cards: one per paper_summaries entry, same order; "title" must match paper_summaries[].title exactly; bullets grounded in paper_summaries.
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "2-4 sentences",
  "overview_en": "2-4 sentences",
  "digest_ru": "Markdown sections as above",
  "digest_en": "Same structure in English",
  "article_cards": [ ... one per paper_summaries item, same order ... ]
}"""


def _retry_after_from_exc(exc: Exception) -> float | None:
    resp = getattr(exc, "response", None)
    if resp is not None:
        headers = getattr(resp, "headers", None) or {}
        ra = headers.get("retry-after") or headers.get("Retry-After")
        if ra:
            try:
                return float(ra)
            except (TypeError, ValueError):
                pass
    return None


def _llm_backoff_seconds(attempt: int) -> float:
    base = settings.llm_retry_base_seconds * (2**attempt)
    cap = 90.0
    return min(cap, base + random.uniform(0, 2.0))


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    m = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return t


def _abstract_chars_limit(p: PublicationInput) -> int:
    s = (p.source or "").lower()
    if s in ("user_pdf", "oa_fulltext"):
        return settings.llm_max_abstract_chars_longtext
    return settings.llm_max_abstract_chars_per_pub


def _abstract_text_kind(p: PublicationInput) -> str:
    s = (p.source or "").lower()
    if s == "user_pdf":
        return "pdf_excerpt"
    if s == "oa_fulltext":
        return "oa_fulltext_excerpt"
    return "metadata_abstract"


def _pub_dict(p: PublicationInput) -> dict[str, Any]:
    lim = _abstract_chars_limit(p)
    ab = (p.abstract or "")[:lim] if p.abstract else ""
    d: dict[str, Any] = {
        "title": p.title,
        "year": p.year,
        "url": p.url,
        "doi": p.doi,
        "abstract": ab,
        "abstract_text_kind": _abstract_text_kind(p),
    }
    if p.is_open_access is not None:
        d["is_open_access"] = p.is_open_access
    if p.oa_url:
        d["oa_url"] = p.oa_url
    return d


def _pub_dict_monthly(p: PublicationInput) -> dict[str, Any]:
    d = _pub_dict(p)
    names = [c.display_name for c in p.concepts if (c.display_name or "").strip()]
    d["openalex_work_id"] = p.openalex_work_id
    d["concept_names_top"] = names[:8]
    return d


def _digest_user_payload(
    publications: list[PublicationInput], topic_queries: list[str]
) -> dict[str, Any]:
    return {
        "topics": topic_queries,
        "publications": [_pub_dict(p) for p in publications],
    }


def _estimate_digest_payload_chars(
    publications: list[PublicationInput], topic_queries: list[str]
) -> int:
    return len(json.dumps(_digest_user_payload(publications, topic_queries), ensure_ascii=False))


def _monthly_user_payload(
    publications: list[PublicationInput],
    topic_queries: list[str],
    structured_delta: MonthlyStructuredDelta,
) -> dict[str, Any]:
    return {
        "topics": topic_queries,
        "is_baseline": structured_delta.is_baseline,
        "structured_delta": structured_delta.model_dump(),
        "publications": [_pub_dict_monthly(p) for p in publications],
    }


def _estimate_monthly_payload_chars(
    publications: list[PublicationInput],
    topic_queries: list[str],
    structured_delta: MonthlyStructuredDelta,
) -> int:
    return len(
        json.dumps(
            _monthly_user_payload(publications, topic_queries, structured_delta),
            ensure_ascii=False,
        )
    )


async def _map_paper_summaries(
    publications: list[PublicationInput],
    topic_queries: list[str],
) -> list[dict[str, Any]]:
    sem = asyncio.Semaphore(max(1, settings.llm_digest_map_concurrency))

    async def one(p: PublicationInput) -> dict[str, Any]:
        async with sem:
            data = await _chat_json_to_dict(
                SYSTEM_MAP_PAPER,
                {"topics": topic_queries, "publication": _pub_dict(p)},
            )
        bullets_ru = data.get("bullets_ru")
        bullets_en = data.get("bullets_en")
        if not isinstance(bullets_ru, list):
            bullets_ru = []
        if not isinstance(bullets_en, list):
            bullets_en = []
        return {
            "title": p.title,
            "url": p.url,
            "year": p.year,
            "doi": p.doi,
            "summary_ru": str(data.get("summary_ru") or ""),
            "summary_en": str(data.get("summary_en") or ""),
            "bullets_ru": [str(x) for x in bullets_ru[:8]],
            "bullets_en": [str(x) for x in bullets_en[:8]],
            "why_relevant": str(data.get("why_relevant") or data.get("why_relevance") or ""),
        }

    return list(await asyncio.gather(*[one(p) for p in publications]))


def _llm_result_from_raw(data: dict[str, Any]) -> DigestLLMResult:
    try:
        return DigestLLMResult.model_validate(data)
    except ValidationError as e:
        logger.warning("LLM JSON shape drift, using partial fallback: %s", e)
        raw_fallback = json.dumps(data, ensure_ascii=False) if data else ""
        return DigestLLMResult(
            overview_ru=str(data.get("overview_ru") or ""),
            overview_en=str(data.get("overview_en") or ""),
            digest_ru=str(data.get("digest_ru") or raw_fallback[:8000]),
            digest_en=str(data.get("digest_en") or ""),
            article_cards=[],
        )


async def _generate_digest_llm_two_stage(
    publications: list[PublicationInput],
    topic_queries: list[str],
) -> DigestLLMResult:
    paper_summaries = await _map_paper_summaries(publications, topic_queries)
    reduce_payload = {"topics": topic_queries, "paper_summaries": paper_summaries}
    data = await _chat_json_to_dict(SYSTEM_REDUCE, reduce_payload)
    return _llm_result_from_raw(data)


async def _generate_monthly_digest_llm_two_stage(
    publications: list[PublicationInput],
    topic_queries: list[str],
    structured_delta: MonthlyStructuredDelta,
) -> DigestLLMResult:
    paper_summaries = await _map_paper_summaries(publications, topic_queries)
    reduce_payload = {
        "topics": topic_queries,
        "is_baseline": structured_delta.is_baseline,
        "structured_delta": structured_delta.model_dump(),
        "paper_summaries": paper_summaries,
    }
    data = await _chat_json_to_dict(SYSTEM_REDUCE_MONTHLY, reduce_payload)
    return _llm_result_from_raw(data)


def _make_openai_async_client() -> tuple[AsyncOpenAI, str]:
    api_key = settings.llm_api_key_resolved()
    client_kw: dict[str, Any] = {"api_key": api_key}
    base_url = (settings.openai_base_url or "").strip()
    if not base_url and (settings.openrouter_api_key or "").strip():
        base_url = "https://openrouter.ai/api/v1"
    if base_url:
        client_kw["base_url"] = base_url
    log_base = base_url or "https://api.openai.com/v1 (SDK default)"
    hdrs: dict[str, str] = {}
    ref = (settings.openrouter_http_referer or "").strip()
    if ref:
        hdrs["HTTP-Referer"] = ref
    title = (settings.openrouter_app_title or "").strip()
    if title:
        hdrs["X-OpenRouter-Title"] = title
    if hdrs:
        client_kw["default_headers"] = hdrs
    client_kw["max_retries"] = 0
    return AsyncOpenAI(**client_kw), log_base.rstrip("/")


async def _chat_json_to_dict(system: str, user_payload: dict[str, Any]) -> dict[str, Any]:
    t_llm0 = time.perf_counter()
    client, log_base = _make_openai_async_client()
    key_src = settings.llm_api_key_source_label()
    logger.info(
        "LLM → %s/chat/completions model=%s key=%s",
        log_base,
        settings.openai_model,
        key_src,
    )
    user_text = json.dumps(user_payload, ensure_ascii=False)
    create_kw: dict[str, Any] = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.35,
    }
    if settings.openai_response_format_json:
        create_kw["response_format"] = {"type": "json_object"}

    completion = None
    for attempt in range(settings.llm_max_retries):
        try:
            completion = await client.chat.completions.create(**create_kw)
            break
        except RateLimitError as e:
            if attempt >= settings.llm_max_retries - 1:
                logger.error(
                    "LLM rate limit: attempts exhausted (%s)",
                    settings.llm_max_retries,
                )
                raise
            ra = _retry_after_from_exc(e) or 0.0
            wait = max(ra, _llm_backoff_seconds(attempt))
            logger.warning(
                "LLM 429 (attempt %s/%s), sleep %.1fs — %s",
                attempt + 1,
                settings.llm_max_retries,
                wait,
                e,
            )
            await asyncio.sleep(wait)
    if completion is None:
        raise RuntimeError(
            "LLM: chat.completions.create did not return after "
            f"{settings.llm_max_retries} attempt(s) (unexpected without exception)"
        )
    usage = getattr(completion, "usage", None)
    if usage is not None:
        logger.info(
            "LLM usage: prompt=%s completion=%s total=%s",
            getattr(usage, "prompt_tokens", None),
            getattr(usage, "completion_tokens", None),
            getattr(usage, "total_tokens", None),
        )
    raw = _strip_json_fence(completion.choices[0].message.content or "{}")
    logger.info(
        "LLM chat round-trip %.2fs (включая ретраи при 429)",
        time.perf_counter() - t_llm0,
    )
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error("LLM returned invalid JSON: %s", e)
        raise



async def generate_web_digest_llm(
    snippets: list[dict[str, Any]],
    topic_queries: list[str],
) -> DigestLLMResult:
    user_payload = {
        "topics": topic_queries,
        "snippets": snippets,
    }
    data = await _chat_json_to_dict(SYSTEM_WEB, user_payload)
    try:
        return DigestLLMResult.model_validate(data)
    except ValidationError as e:
        logger.warning("LLM web JSON shape drift, using partial fallback: %s", e)
        raw_fallback = json.dumps(data, ensure_ascii=False) if data else ""
        return DigestLLMResult(
            overview_ru=str(data.get("overview_ru") or ""),
            overview_en=str(data.get("overview_en") or ""),
            digest_ru=str(data.get("digest_ru") or raw_fallback[:8000]),
            digest_en=str(data.get("digest_en") or ""),
            article_cards=[],
        )


async def generate_digest_llm(
    publications: list[PublicationInput],
    topic_queries: list[str],
    *,
    force_two_stage: bool = False,
) -> tuple[DigestLLMResult, bool]:
    est = _estimate_digest_payload_chars(publications, topic_queries)
    use_two_stage = force_two_stage or est > settings.llm_digest_prompt_budget_chars
    if use_two_stage:
        logger.info(
            "digest LLM: two-stage map-reduce (est_chars=%s budget=%s force=%s)",
            est,
            settings.llm_digest_prompt_budget_chars,
            force_two_stage,
        )
        return await _generate_digest_llm_two_stage(publications, topic_queries), True

    user_payload = _digest_user_payload(publications, topic_queries)
    data = await _chat_json_to_dict(SYSTEM, user_payload)
    return _llm_result_from_raw(data), False


async def generate_monthly_digest_llm(
    publications: list[PublicationInput],
    topic_queries: list[str],
    structured_delta: MonthlyStructuredDelta,
    *,
    force_two_stage: bool = False,
) -> tuple[DigestLLMResult, bool]:
    est = _estimate_monthly_payload_chars(publications, topic_queries, structured_delta)
    use_two_stage = force_two_stage or est > settings.llm_digest_prompt_budget_chars
    if use_two_stage:
        logger.info(
            "monthly digest LLM: two-stage map-reduce (est_chars=%s budget=%s force=%s)",
            est,
            settings.llm_digest_prompt_budget_chars,
            force_two_stage,
        )
        return await _generate_monthly_digest_llm_two_stage(
            publications, topic_queries, structured_delta
        ), True

    user_payload = _monthly_user_payload(publications, topic_queries, structured_delta)
    data = await _chat_json_to_dict(SYSTEM_MONTHLY, user_payload)
    return _llm_result_from_raw(data), False
