import asyncio
import json
import logging
import random
import re
import time
from typing import Any

from openai import APIConnectionError, AsyncOpenAI, RateLimitError
from pydantic import ValidationError

from digest.config import settings
from digest.llm_override import resolve_effective_llm_runtime
from digest.models import ArticleCard, DigestLLMResult, MonthlyStructuredDelta, PublicationInput

logger = logging.getLogger(__name__)

SYSTEM = """You are a research assistant producing digests for a lab.
Rules:
- Use ONLY the provided publication fields (title, year, url, doi, abstract; optional is_open_access, oa_url). The field abstract_text_kind tells you what "abstract" contains: metadata_abstract (journal abstract), pdf_excerpt (first pages from a user PDF), or oa_fulltext_excerpt (longer excerpt from an open-access PDF). For excerpts, focus on visible content only; do not infer unseen parts of the paper.
- Do not invent methods, results, numbers, or citations not supported by the provided text.
- When abstract is present, summary_ru and summary_en must paraphrase it (goal, approach if visible, main findings or limitations). Do not merely repeat the title.
- When abstract is empty, write 2-4 conservative sentences from the title and note limited data.
- Keep the whole JSON compact enough to finish within ~12000 completion tokens. Prefer clear prose over length.
- Respond with a single JSON object, no markdown fences.
JSON shape:
{
  "overview_ru": "4-6 sentences synthesizing themes, methods, gaps, and relevance to the user's topics",
  "overview_en": "4-6 sentences in English",
  "digest_ru": "Markdown (~400-700 words): ## Обзор (1-2 paragraphs), ## Тематические блоки (short cluster intros + bullets), ## Ключевые публикации (for EACH paper: ### Title, 1 short paragraph + 3-5 bullets)",
  "digest_en": "Same structure, similarly compact, in English",
  "article_cards": [
    {
      "title": "must match an input title exactly",
      "url": "from input or empty",
      "year": null,
      "summary_ru": "3-5 sentences grounded in abstract; if abstract empty, 2-3 sentences from title with uncertainty note",
      "summary_en": "same in English",
      "bullets": ["3-5 substantive points grounded in the text"],
      "why_relevant": "1-2 sentences tied to the user's topics and lab interests"
    }
  ]
}
Include one article_card per input publication, in the same order as given."""

SYSTEM_MAP_PAPER = """You analyze ONE publication record for a research lab digest.
The "abstract" field may be a journal abstract (metadata_abstract), text from the first pages of a PDF (pdf_excerpt), or a longer excerpt from an open-access PDF (oa_fulltext_excerpt) — see abstract_text_kind.
Rules:
- Use ONLY the provided publication fields. Do not invent statistics, methods, or results not supported by the text.
- When abstract/snippet is present, summary must cover goal, approach (if visible), main point, and limitations.
- If the text is short or empty, say so briefly and stay conservative.
- Keep JSON compact; finish fully within the token limit.
- Respond with a single JSON object, no markdown fences.
JSON shape:
{
  "title_match": "must equal the input title exactly",
  "summary_ru": "4-6 sentences: goal, approach if visible, main findings, limitations, and practical takeaway",
  "summary_en": "same in English",
  "bullets_ru": ["3-5 substantive points grounded in the text"],
  "bullets_en": ["3-5 substantive points in English"],
  "why_relevant": "1-2 sentences tying the paper to the user topics and lab interests"
}"""

SYSTEM_REDUCE = """You synthesize a research digest from per-paper summaries only (the full text was already summarized per paper).
Rules:
- Use ONLY paper_summaries and topics. Do not invent statistics, DOIs, or claims not present in the summaries.
- Do NOT rewrite per-paper summaries into article_cards text fields: leave summary_ru, summary_en, bullets, and why_relevant as empty strings/arrays. Server fills them from paper_summaries.
- article_cards: only title/url/year stubs; "title" must match each paper_summaries[].title exactly, same order.
- Keep digest compact (~400-700 words per language). Theme-level synthesis only — do not re-summarize every paper in depth.
- Respond with a single JSON object, no markdown fences.
JSON shape:
{
  "overview_ru": "4-6 sentences",
  "overview_en": "4-6 sentences",
  "digest_ru": "Markdown (~400-700 words): ## Обзор, ## Тематические блоки, ## Ключевые публикации (title + 1 short relevance line each)",
  "digest_en": "Same structure, similarly compact, in English",
  "article_cards": [
    {
      "title": "must match an input title exactly",
      "url": "from paper_summaries or empty",
      "year": null,
      "summary_ru": "",
      "summary_en": "",
      "bullets": [],
      "why_relevant": ""
    }
  ]
}
Include one article_card stub per paper_summaries entry, in the same order as given."""

SYSTEM_WEB = """You summarize WEB SEARCH SNIPPETS for a research lab (not peer-reviewed literature).
Rules:
- This is NOT a systematic review or a catalog of journal articles. Treat each item as a web page with a short excerpt.
- Use ONLY facts and phrasing supported by the provided snippets. Do not invent statistics, paper titles, DOIs, or journal names not present in snippets.
- summary_ru and summary_en must expand on the snippet content; if snippet is very short, state that limitation.
- If information is missing or uncertain, say so briefly.
- Keep the whole JSON compact enough to finish within ~12000 completion tokens.
- article_cards: "title" must match a snippet title exactly; "url" from that snippet.
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "4-6 sentences; mention web-snippet limitation and main themes",
  "overview_en": "4-6 sentences",
  "digest_ru": "Markdown (~300-600 words): disclaimer that this is web search snippets, then thematic blocks and short per-source highlights",
  "digest_en": "Same structure, similarly compact, in English",
  "article_cards": [
    {
      "title": "must match an input snippet title exactly",
      "url": "from snippet",
      "year": null,
      "summary_ru": "3-5 sentences from snippet only",
      "summary_en": "same in English",
      "bullets": ["3-5 substantive points from snippet only"],
      "why_relevant": "1-2 sentences"
    }
  ]
}
Include one article_card per input snippet, in the same order as given."""



SYSTEM_MONTHLY = """You are a research assistant writing a MONTHLY trend digest for a research lab.
Rules:
- Use ONLY facts present in structured_delta and publication fields (title, year, url, doi, abstract, abstract_text_kind, optional concept names). abstract_text_kind indicates metadata_abstract vs pdf_excerpt vs oa_fulltext_excerpt vs web_snippet (Tavily snippet text, not a full paper). Do not invent citation counts, ranks, or concept shares.
- If is_baseline is true, state clearly that this is the first stored snapshot and month-to-month comparisons are unavailable; still summarize current papers.
- In digest_ru and digest_en, use Markdown with these sections in order:
  1) **Disclaimer** (one short paragraph): metrics come from snapshot comparisons of this corpus; citation data lag; "popularity" means citation change / rank within this sample, not definitive global impact.
  2) **Observed metric shifts** — only quantitative/tabular facts from structured_delta (top citation gains, entered/left top-K, concept share deltas). If a list is empty, say so briefly.
  3) **Current highlights** — thematic clusters; for each paper 1 short paragraph plus 3-5 bullets.
  4) **Risks and discussion hypotheses** — 1-2 paragraphs of hypotheses for expert discussion, NOT firm predictions.
- When abstract is present, article_card summary must paraphrase it. When abstract is empty, 2-3 sentences from title with uncertainty note.
- Keep the whole JSON compact enough to finish within ~12000 completion tokens.
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "4-6 sentences on period dynamics and corpus themes",
  "overview_en": "4-6 sentences",
  "digest_ru": "Markdown (~400-700 words) with all sections above",
  "digest_en": "Same structure, similarly compact, in English",
  "article_cards": [
    {
      "title": "must match an input title exactly",
      "url": "from input or empty",
      "year": null,
      "summary_ru": "3-5 sentences grounded in abstract",
      "summary_en": "same in English",
      "bullets": ["3-5 substantive points"],
      "why_relevant": "1-2 sentences tied to the user's topics"
    }
  ]
}
Include one article_card per input publication, in the same order as given."""

SYSTEM_TREND_SERIES = """You are a research assistant writing a CROSS-PERIOD trend analysis for a research lab direction.
You receive period_highlights (monthly snapshot comparisons) and concept_evolution (OpenAlex concept shares over time).
Rules:
- Use ONLY facts present in period_highlights and concept_evolution. Do not invent citation counts, ranks, or concept shares.
- If fewer than 2 non-baseline comparison periods exist, state that longitudinal comparison is limited.
- Prefer depth over brevity: write a substantive analytical report for lab leadership (~1500-3500 words in analysis_ru/analysis_en).
- Reference concrete data: period names, paper titles, concept names, numeric shifts from the input.
- In analysis_ru and analysis_en, use Markdown with these sections in order:
  1) **Disclaimer** (one paragraph): metrics come from saved snapshot comparisons of this corpus; citation data lag; sample is the lab's fixed top-K, not the whole field.
  2) **Overall dynamics** — 3-5 paragraphs on trend of work_count, churn (entered/left top-K), stability vs volatility across periods; cite specific periods and numbers.
  3) **Citation and ranking shifts** — 3-5 paragraphs on recurring leaders, largest citation gains, papers entering/leaving top-K (only from provided data); name papers and periods.
  4) **Concept evolution** — 2-4 paragraphs on which OpenAlex concepts gained or lost share across the series; cite concept names and share changes.
  5) **Discussion hypotheses** — 2-4 paragraphs of hypotheses for expert discussion, clearly labeled, NOT firm predictions.
- Respond with a single JSON object, no markdown fences.
JSON shape:
{
  "overview_ru": "8-12 sentences summarizing the direction's trajectory and key takeaways",
  "overview_en": "8-12 sentences",
  "analysis_ru": "Detailed Markdown with all sections above; each major section multiple paragraphs with concrete references to input data",
  "analysis_en": "Same structure and depth in English"
}"""

SYSTEM_REDUCE_MONTHLY = """You are a research assistant writing a MONTHLY trend digest for a research lab.
You receive structured_delta (metric comparisons between snapshots) and paper_summaries (short per-paper notes derived from abstracts, excerpts, or web_snippet text from Tavily — not full papers).
Rules:
- Use ONLY facts present in structured_delta and paper_summaries. Do not invent citation counts, ranks, or concept shares — quantitative claims must come from structured_delta.
- If is_baseline is true, state clearly that this is the first stored snapshot and month-to-month comparisons are unavailable; still summarize current papers from paper_summaries.
- In digest_ru and digest_en, use Markdown with these sections in order:
  1) **Disclaimer** (one short paragraph): metrics come from snapshot comparisons of this corpus; citation data lag; "popularity" means citation change / rank within this sample, not definitive global impact.
  2) **Observed metric shifts** — only quantitative/tabular facts from structured_delta (top citation gains, entered/left top-K, concept share deltas). If a list is empty, say so briefly.
  3) **Current highlights** — thematic clusters from paper_summaries; title + 1 short line each, do not re-expand full summaries.
  4) **Risks and discussion hypotheses** — 1-2 paragraphs of hypotheses for expert discussion, NOT firm predictions.
- Do NOT rewrite per-paper summaries into article_cards text fields: leave summary_ru, summary_en, bullets, and why_relevant empty. Server fills them from paper_summaries.
- article_cards: only title/url/year stubs; "title" must match each paper_summaries[].title exactly, same order.
- Keep digest compact (~400-700 words per language).
- Respond with a single JSON object, no markdown fences.
Same JSON shape as the standard digest:
{
  "overview_ru": "4-6 sentences on period dynamics and corpus themes",
  "overview_en": "4-6 sentences",
  "digest_ru": "Markdown (~400-700 words) with all sections above",
  "digest_en": "Same structure, similarly compact, in English",
  "article_cards": [
    {
      "title": "must match paper_summaries title exactly",
      "url": "from paper_summaries or empty",
      "year": null,
      "summary_ru": "",
      "summary_en": "",
      "bullets": [],
      "why_relevant": ""
    }
  ]
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
    if s == "web_snippet":
        return "web_snippet"
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


def _abstract_excerpt(text: str, max_chars: int = 600) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if not t:
        return ""
    if len(t) <= max_chars:
        return t
    cut = t[:max_chars]
    last_space = cut.rfind(" ")
    if last_space > max_chars // 2:
        cut = cut[:last_space]
    return cut.rstrip() + "…"


def _merge_map_summaries_into_cards(
    result: DigestLLMResult,
    paper_summaries: list[dict[str, Any]],
) -> DigestLLMResult:
    by_title = {str(s.get("title") or ""): s for s in paper_summaries if s.get("title")}
    new_cards: list[ArticleCard] = []
    for card in result.article_cards:
        ps = by_title.get(card.title, {})
        summary_ru = card.summary_ru.strip() or str(ps.get("summary_ru") or "").strip()
        summary_en = card.summary_en.strip() or str(ps.get("summary_en") or "").strip()
        bullets = list(card.bullets)
        if not bullets:
            bullets_ru = ps.get("bullets_ru")
            if isinstance(bullets_ru, list) and bullets_ru:
                bullets = [str(x) for x in bullets_ru[:8]]
        why_relevant = card.why_relevant.strip() or str(ps.get("why_relevant") or "").strip()
        new_cards.append(
            card.model_copy(
                update={
                    "summary_ru": summary_ru,
                    "summary_en": summary_en,
                    "bullets": bullets,
                    "why_relevant": why_relevant,
                }
            )
        )
    return result.model_copy(update={"article_cards": new_cards})


def _ensure_card_summaries(
    result: DigestLLMResult,
    publications: list[PublicationInput],
    *,
    max_excerpt: int = 1200,
) -> DigestLLMResult:
    by_title = {p.title: p for p in publications}
    new_cards: list[ArticleCard] = []
    for i, card in enumerate(result.article_cards):
        pub = by_title.get(card.title) or (publications[i] if i < len(publications) else None)
        summary_ru = card.summary_ru.strip()
        summary_en = card.summary_en.strip()
        if not summary_en and pub and (pub.abstract or "").strip():
            summary_en = _abstract_excerpt(pub.abstract, max_excerpt)
        new_cards.append(
            card.model_copy(update={"summary_ru": summary_ru, "summary_en": summary_en})
        )
    return result.model_copy(update={"article_cards": new_cards})


def _cards_from_paper_summaries(paper_summaries: list[dict[str, Any]]) -> list[ArticleCard]:
    cards: list[ArticleCard] = []
    for s in paper_summaries:
        title = str(s.get("title") or "").strip()
        if not title:
            continue
        bullets_ru = s.get("bullets_ru")
        bullets = [str(x) for x in bullets_ru[:8]] if isinstance(bullets_ru, list) else []
        year_raw = s.get("year")
        year = year_raw if isinstance(year_raw, int) else None
        cards.append(
            ArticleCard(
                title=title,
                url=str(s.get("url") or ""),
                year=year,
                summary_ru=str(s.get("summary_ru") or ""),
                summary_en=str(s.get("summary_en") or ""),
                bullets=bullets,
                why_relevant=str(s.get("why_relevant") or ""),
            )
        )
    return cards


def _finalize_digest_result(
    result: DigestLLMResult,
    publications: list[PublicationInput],
    paper_summaries: list[dict[str, Any]] | None = None,
) -> DigestLLMResult:
    if paper_summaries:
        if not result.article_cards:
            result = result.model_copy(
                update={"article_cards": _cards_from_paper_summaries(paper_summaries)}
            )
        result = _merge_map_summaries_into_cards(result, paper_summaries)
    return _ensure_card_summaries(result, publications)


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
    result = _llm_result_from_raw(data)
    return _finalize_digest_result(result, publications, paper_summaries)


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
    result = _llm_result_from_raw(data)
    return _finalize_digest_result(result, publications, paper_summaries)


def _make_openai_async_client() -> tuple[AsyncOpenAI, str]:
    rt = resolve_effective_llm_runtime()
    client_kw: dict[str, Any] = {
        "api_key": rt.api_key,
        "max_retries": 0,
        "timeout": float(settings.llm_timeout_seconds),
    }
    if rt.base_url:
        client_kw["base_url"] = rt.base_url
    log_base = rt.base_url or "https://api.openai.com/v1 (SDK default)"
    hdrs: dict[str, str] = {}
    ref = (settings.openrouter_http_referer or "").strip()
    if ref and rt.base_url and "openrouter" in rt.base_url.lower():
        hdrs["HTTP-Referer"] = ref
    title = (settings.openrouter_app_title or "").strip()
    if title and rt.base_url and "openrouter" in rt.base_url.lower():
        hdrs["X-OpenRouter-Title"] = title
    if hdrs:
        client_kw["default_headers"] = hdrs
    return AsyncOpenAI(**client_kw), log_base.rstrip("/")


def _completion_choice_text(completion: Any) -> str | None:
    """Текст assistant из первого choice или None при пустом/нестандартном ответе API."""
    choices = getattr(completion, "choices", None)
    if choices is None or len(choices) == 0:
        return None
    msg = getattr(choices[0], "message", None)
    if msg is None:
        return None
    content = getattr(msg, "content", None)
    if content is None:
        return None
    if isinstance(content, str):
        s = content.strip()
        return s if s else None
    if isinstance(content, list):
        parts: list[str] = []
        for p in content:
            if isinstance(p, dict) and p.get("type") == "text":
                t = p.get("text")
                if isinstance(t, str) and t.strip():
                    parts.append(t.strip())
            elif hasattr(p, "text"):
                t = getattr(p, "text", None)
                if isinstance(t, str) and t.strip():
                    parts.append(t.strip())
        merged = "\n".join(parts).strip()
        return merged if merged else None
    s = str(content).strip()
    return s if s else None


async def _chat_json_to_dict(system: str, user_payload: dict[str, Any]) -> dict[str, Any]:
    t_llm0 = time.perf_counter()
    client, log_base = _make_openai_async_client()
    rt = resolve_effective_llm_runtime()
    logger.info(
        "LLM → %s/chat/completions model=%s key=%s",
        log_base,
        rt.model,
        rt.key_source_label,
    )
    user_text = json.dumps(user_payload, ensure_ascii=False)
    create_kw: dict[str, Any] = {
        "model": rt.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.35,
        "max_tokens": settings.llm_max_completion_tokens,
    }
    if rt.json_format:
        create_kw["response_format"] = {"type": "json_object"}

    completion = None
    choice_text: str | None = None
    for attempt in range(settings.llm_max_retries):
        try:
            completion = await client.chat.completions.create(**create_kw)
            choice_text = _completion_choice_text(completion)
            if choice_text is not None:
                break
            logger.warning(
                "LLM: ответ без текста в choices/message (попытка %s/%s)",
                attempt + 1,
                settings.llm_max_retries,
            )
            if attempt < settings.llm_max_retries - 1:
                await asyncio.sleep(_llm_backoff_seconds(attempt))
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
        except APIConnectionError as e:
            if attempt >= settings.llm_max_retries - 1:
                logger.error(
                    "LLM connection error: attempts exhausted (%s)",
                    settings.llm_max_retries,
                )
                raise
            wait = _llm_backoff_seconds(attempt)
            logger.warning(
                "LLM connection error (attempt %s/%s), sleep %.1fs — %s",
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
    if choice_text is None:
        raise RuntimeError(
            "LLM: пустой ответ модели (нет choices или message.content). "
            "Часто бывает у бесплатных маршрутов OpenRouter — смените модель или отключите JSON-режим."
        )
    usage = getattr(completion, "usage", None)
    if usage is not None:
        logger.info(
            "LLM usage: prompt=%s completion=%s total=%s",
            getattr(usage, "prompt_tokens", None),
            getattr(usage, "completion_tokens", None),
            getattr(usage, "total_tokens", None),
        )
    raw = _strip_json_fence(choice_text)
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
    publications: list[PublicationInput] | None = None,
) -> DigestLLMResult:
    user_payload = {
        "topics": topic_queries,
        "snippets": snippets,
    }
    data = await _chat_json_to_dict(SYSTEM_WEB, user_payload)
    try:
        result = DigestLLMResult.model_validate(data)
    except ValidationError as e:
        logger.warning("LLM web JSON shape drift, using partial fallback: %s", e)
        raw_fallback = json.dumps(data, ensure_ascii=False) if data else ""
        result = DigestLLMResult(
            overview_ru=str(data.get("overview_ru") or ""),
            overview_en=str(data.get("overview_en") or ""),
            digest_ru=str(data.get("digest_ru") or raw_fallback[:8000]),
            digest_en=str(data.get("digest_en") or ""),
            article_cards=[],
        )
    if publications:
        result = _finalize_digest_result(result, publications)
    return result


async def generate_digest_llm(
    publications: list[PublicationInput],
    topic_queries: list[str],
    *,
    force_two_stage: bool = False,
) -> tuple[DigestLLMResult, bool]:
    est = _estimate_digest_payload_chars(publications, topic_queries)
    n_pubs = len(publications)
    use_two_stage = (
        force_two_stage
        or est > settings.llm_digest_prompt_budget_chars
        or n_pubs >= settings.llm_digest_two_stage_min_pubs
    )
    if use_two_stage:
        logger.info(
            "digest LLM: two-stage map-reduce (est_chars=%s budget=%s n_pubs=%s min_pubs=%s force=%s)",
            est,
            settings.llm_digest_prompt_budget_chars,
            n_pubs,
            settings.llm_digest_two_stage_min_pubs,
            force_two_stage,
        )
        return await _generate_digest_llm_two_stage(publications, topic_queries), True

    user_payload = _digest_user_payload(publications, topic_queries)
    data = await _chat_json_to_dict(SYSTEM, user_payload)
    result = _llm_result_from_raw(data)
    return _finalize_digest_result(result, publications), False


def _trend_series_user_payload(
    *,
    display_name: str,
    topic_queries: list[str],
    period_highlights: list[dict[str, Any]],
    concept_evolution: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "direction_name": display_name,
        "topics": topic_queries,
        "period_highlights": period_highlights,
        "concept_evolution": concept_evolution,
    }


def _trend_analysis_from_raw(data: dict[str, Any]) -> dict[str, str]:
    return {
        "overview_ru": str(data.get("overview_ru") or ""),
        "overview_en": str(data.get("overview_en") or ""),
        "analysis_ru": str(data.get("analysis_ru") or data.get("digest_ru") or ""),
        "analysis_en": str(data.get("analysis_en") or data.get("digest_en") or ""),
    }


async def generate_trend_series_analysis_llm(
    *,
    display_name: str,
    topic_queries: list[str],
    period_highlights: list[dict[str, Any]],
    concept_evolution: list[dict[str, Any]],
) -> dict[str, str]:
    user_payload = _trend_series_user_payload(
        display_name=display_name,
        topic_queries=topic_queries,
        period_highlights=period_highlights,
        concept_evolution=concept_evolution,
    )
    data = await _chat_json_to_dict(SYSTEM_TREND_SERIES, user_payload)
    result = _trend_analysis_from_raw(data)
    if result["overview_ru"] and result["analysis_ru"] and result["overview_ru"] not in result["analysis_ru"]:
        result["analysis_ru"] = f"**Обзор:** {result['overview_ru']}\n\n{result['analysis_ru']}"
    if result["overview_en"] and result["analysis_en"] and result["overview_en"] not in result["analysis_en"]:
        result["analysis_en"] = f"**Overview:** {result['overview_en']}\n\n{result['analysis_en']}"
    return result


async def generate_monthly_digest_llm(
    publications: list[PublicationInput],
    topic_queries: list[str],
    structured_delta: MonthlyStructuredDelta,
    *,
    force_two_stage: bool = False,
) -> tuple[DigestLLMResult, bool]:
    est = _estimate_monthly_payload_chars(publications, topic_queries, structured_delta)
    n_pubs = len(publications)
    use_two_stage = (
        force_two_stage
        or est > settings.llm_digest_prompt_budget_chars
        or n_pubs >= settings.llm_digest_two_stage_min_pubs
    )
    if use_two_stage:
        logger.info(
            "monthly digest LLM: two-stage map-reduce (est_chars=%s budget=%s n_pubs=%s min_pubs=%s force=%s)",
            est,
            settings.llm_digest_prompt_budget_chars,
            n_pubs,
            settings.llm_digest_two_stage_min_pubs,
            force_two_stage,
        )
        return await _generate_monthly_digest_llm_two_stage(
            publications, topic_queries, structured_delta
        ), True

    user_payload = _monthly_user_payload(publications, topic_queries, structured_delta)
    data = await _chat_json_to_dict(SYSTEM_MONTHLY, user_payload)
    result = _llm_result_from_raw(data)
    return _finalize_digest_result(result, publications), False
