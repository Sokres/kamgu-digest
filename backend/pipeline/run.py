import logging
import time

import httpx

from digest.config import settings
from digest.models import DigestMeta, DigestRequest, DigestResponse, PublicationInput
from documents.store import get_store, load_publications_for_digest
from pipeline.dedupe import dedupe_publications
from pipeline.ingest_sources import ingest_peer_reviewed_sources
from pipeline.llm import generate_digest_llm
from pipeline.score import rank_for_llm
from sources.crossref import enrich_publications_crossref

logger = logging.getLogger(__name__)


async def run_digest(req: DigestRequest, document_user_id: str | None = None) -> DigestResponse:
    if req.digest_mode == "web_snippets":
        from pipeline.run_web import run_web_digest

        return await run_web_digest(req)

    t0 = time.perf_counter()
    meta_warnings: list[str] = []

    timeout = httpx.Timeout(settings.http_timeout_seconds)
    async with httpx.AsyncClient(
        timeout=timeout,
        headers=settings.http_client_headers(),
    ) as client:
        ing = await ingest_peer_reviewed_sources(
            client,
            topic_queries=req.topic_queries,
            max_candidates=req.max_candidates,
            from_year=req.from_year,
            to_year=req.to_year,
            peer_reviewed_only=req.peer_reviewed_only,
            openalex_concept_id=req.openalex_concept_id,
            openalex_source_ids=req.openalex_source_ids,
        )
        meta_warnings.extend(ing.warnings)
        oa_count = ing.n_openalex
        ss_count = ing.n_semantic_scholar
        core_count = ing.n_core
        cr_dois = ing.crossref_enriched_dois

        pdf_enriched: list[PublicationInput] = []
        pdf_cr = 0
        if req.attached_document_ids:
            store = get_store(document_user_id)
            pdf_pubs, doc_warn, missing = load_publications_for_digest(
                store, req.attached_document_ids
            )
            meta_warnings.extend(doc_warn)
            for mid in missing:
                meta_warnings.append(f"document_not_found:{mid}")
            if pdf_pubs:
                pdf_enriched, w_pdf, pdf_cr = await enrich_publications_crossref(
                    client, pdf_pubs
                )
                meta_warnings.extend(w_pdf)

        raw: list[PublicationInput] = list(ing.publications) + pdf_enriched
        cr_dois = cr_dois + pdf_cr
    exclude = set(req.exclude_dois)
    deduped = dedupe_publications(raw, exclude)
    ranked = rank_for_llm(deduped, req.topic_queries, req.top_n_for_llm)

    logger.info(
        "Ingest: openalex=%s semantic_scholar=%s core=%s crossref_dois=%s deduped=%s ranked_for_llm=%s",
        oa_count,
        ss_count,
        core_count,
        cr_dois,
        len(deduped),
        len(ranked),
    )

    if not ranked:
        logger.warning(
            "LLM/OpenRouter не вызывается: нет ни одной статьи после отбора "
            "(часто SS=429 и пустой OpenAlex на этом запросе)."
        )
        extra_pdf = (
            " Загруженные PDF не дали кандидатов после фильтров (exclude_dois, год) или текст не извлечён."
            if req.attached_document_ids
            else ""
        )
        raise ValueError(
            "Не найдено публикаций: пустой OpenAlex на этом запросе, Semantic Scholar 403/429/пусто, "
            "или фильтр по годам/типу (type:article) и концептам. Для 403 у SS задайте OPENALEX_MAILTO или "
            "HTTP_USER_AGENT и/или SEMANTIC_SCHOLAR_API_KEY. Либо SEMANTIC_SCHOLAR_ENABLED=false и больший max_candidates, "
            "либо peer_reviewed_only=false."
            + extra_pdf
        )

    llm = await generate_digest_llm(ranked, req.topic_queries)

    digest_ru = llm.digest_ru.strip()
    digest_en = llm.digest_en.strip()
    if llm.overview_ru and digest_ru and llm.overview_ru not in digest_ru:
        digest_ru = f"**Обзор:** {llm.overview_ru}\n\n{digest_ru}"
    if llm.overview_en and digest_en and llm.overview_en not in digest_en:
        digest_en = f"**Overview:** {llm.overview_en}\n\n{digest_en}"

    elapsed = time.perf_counter() - t0
    n_user_pdf = len([p for p in raw if (p.source or "") == "user_pdf"])

    meta = DigestMeta(
        digest_mode="peer_reviewed",
        candidates_openalex=oa_count,
        candidates_semantic_scholar=ss_count,
        candidates_core=core_count,
        crossref_enriched_dois=cr_dois,
        user_pdf_documents=n_user_pdf,
        after_dedupe=len(deduped),
        used_for_llm=len(ranked),
        elapsed_seconds=round(elapsed, 3),
        warnings=meta_warnings,
    )
    logger.info("digest done %s", meta.model_dump())

    return DigestResponse(
        publications_used=ranked,
        article_cards=llm.article_cards,
        digest_ru=digest_ru,
        digest_en=digest_en,
        meta=meta,
    )
