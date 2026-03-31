import asyncio
import json
import logging
import random
import re
from typing import Any

from openai import AsyncOpenAI, RateLimitError
from pydantic import ValidationError

from digest.config import settings
from digest.models import DigestLLMResult, MonthlyStructuredDelta, PublicationInput

logger = logging.getLogger(__name__)

SYSTEM = """You are a research assistant producing digests for a lab.
Rules:
- Use ONLY the provided publication fields (title, year, url, doi, abstract; optional is_open_access, oa_url). Do not invent methods, results, or citations.
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
- Use ONLY facts present in structured_delta and publication fields (title, year, url, doi, abstract, optional concept names). Do not invent citation counts, ranks, or concept shares.
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


def _pub_dict(p: PublicationInput) -> dict[str, Any]:
    d: dict[str, Any] = {
        "title": p.title,
        "year": p.year,
        "url": p.url,
        "doi": p.doi,
        "abstract": p.abstract[:8000] if p.abstract else "",
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
) -> DigestLLMResult:
    user_payload = {
        "topics": topic_queries,
        "publications": [_pub_dict(p) for p in publications],
    }
    data = await _chat_json_to_dict(SYSTEM, user_payload)
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


async def generate_monthly_digest_llm(
    publications: list[PublicationInput],
    topic_queries: list[str],
    structured_delta: MonthlyStructuredDelta,
) -> DigestLLMResult:
    user_payload = {
        "topics": topic_queries,
        "is_baseline": structured_delta.is_baseline,
        "structured_delta": structured_delta.model_dump(),
        "publications": [_pub_dict_monthly(p) for p in publications],
    }
    data = await _chat_json_to_dict(SYSTEM_MONTHLY, user_payload)
    try:
        return DigestLLMResult.model_validate(data)
    except ValidationError as e:
        logger.warning("LLM monthly JSON shape drift, partial fallback: %s", e)
        raw_fallback = json.dumps(data, ensure_ascii=False) if data else ""
        return DigestLLMResult(
            overview_ru=str(data.get("overview_ru") or ""),
            overview_en=str(data.get("overview_en") or ""),
            digest_ru=str(data.get("digest_ru") or raw_fallback[:8000]),
            digest_en=str(data.get("digest_en") or ""),
            article_cards=[],
        )
