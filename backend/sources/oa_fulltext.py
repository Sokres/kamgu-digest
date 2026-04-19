"""Загрузка OA PDF по DOI (Unpaywall), извлечение текста, кэш на диске."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import httpx

from digest.config import settings
from digest.models import PublicationInput
from documents.pdf_extract import extract_publication_from_pdf

logger = logging.getLogger(__name__)

_UNPAYWALL_BASE = "https://api.unpaywall.org/v2"


def _doi_file_slug(doi: str) -> str:
    s = doi.strip().lower()
    s = re.sub(r"[^\w.\-]+", "_", s)
    return s[:220] or "unknown"


def _cache_paths(doi: str) -> tuple[Path, Path]:
    root = Path(settings.oa_fulltext_cache_dir)
    slug = _doi_file_slug(doi)
    return root / f"{slug}.json", root / f"{slug}.pdf"


def _load_cache(meta_path: Path) -> dict | None:
    if not meta_path.is_file():
        return None
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_cache(meta_path: Path, payload: dict) -> None:
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(payload, ensure_ascii=False, indent=0), encoding="utf-8")


async def _unpaywall_lookup(client: httpx.AsyncClient, doi: str, email: str) -> dict | None:
    enc = quote(doi.strip(), safe="")
    url = f"{_UNPAYWALL_BASE}/{enc}?email={quote(email)}"
    try:
        r = await client.get(url)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, dict) else None
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("Unpaywall HTTP error for DOI %s: %s", doi, e)
        return None


def _pdf_url_from_unpaywall(data: dict) -> str | None:
    if not data.get("is_oa"):
        return None
    loc = data.get("best_oa_location")
    if not isinstance(loc, dict):
        return None
    for key in ("url_for_pdf", "url"):
        u = (loc.get(key) or "").strip()
        if u.startswith("http"):
            return u
    return None


async def _download_pdf(client: httpx.AsyncClient, url: str) -> bytes | None:
    try:
        r = await client.get(
            url,
            follow_redirects=True,
            timeout=httpx.Timeout(120.0),
        )
        r.raise_for_status()
        data = r.content
        if len(data) > settings.oa_fulltext_max_download_bytes:
            logger.warning("OA PDF too large: %s bytes", len(data))
            return None
        if len(data) >= 4 and data[:4] == b"%PDF":
            return data
        logger.warning("Downloaded resource is not a PDF (no %%PDF header)")
        return None
    except httpx.HTTPError as e:
        logger.warning("OA PDF download failed: %s", e)
        return None


def _merge_longer_abstract(pub: PublicationInput, extracted: PublicationInput) -> PublicationInput:
    new_abs = (extracted.abstract or "").strip()
    old_abs = (pub.abstract or "").strip()
    if len(new_abs) <= len(old_abs) + 200:
        return pub
    return PublicationInput(
        title=pub.title,
        abstract=new_abs,
        year=pub.year or extracted.year,
        url=pub.url,
        doi=pub.doi,
        source="oa_fulltext",
        citation_count=pub.citation_count,
        openalex_work_id=pub.openalex_work_id,
        concepts=pub.concepts,
        is_open_access=pub.is_open_access if pub.is_open_access is not None else True,
        oa_url=pub.oa_url or extracted.oa_url,
    )


async def enrich_publications_with_oa_fulltext(
    client: httpx.AsyncClient,
    publications: list[PublicationInput],
) -> tuple[list[PublicationInput], list[str], int]:
    """
    Для работ с DOI (кроме user_pdf) пытается получить OA PDF через Unpaywall,
    извлечь текст и заменить abstract, если извлечённый текст существенно длиннее.
    Результаты кэшируются в oa_fulltext_cache_dir.
    """
    email = settings.unpaywall_email_resolved()
    warnings: list[str] = []
    if not email:
        warnings.append("oa_fulltext_skipped:no_unpaywall_email")
        return publications, warnings, 0

    out: list[PublicationInput] = []
    fetched = 0
    for pub in publications:
        if fetched >= settings.oa_fulltext_max_per_digest:
            out.append(pub)
            continue
        if (pub.source or "") == "user_pdf":
            out.append(pub)
            continue
        doi = (pub.doi or "").strip()
        if not doi:
            out.append(pub)
            continue

        meta_path, pdf_path = _cache_paths(doi)
        cached = _load_cache(meta_path)
        extracted_pub: PublicationInput | None = None

        if cached and isinstance(cached.get("abstract"), str) and len(cached["abstract"]) > 200:
            extracted_pub = PublicationInput(
                title=cached.get("title") or pub.title,
                abstract=cached["abstract"],
                year=cached.get("year") or pub.year,
                url=pub.url,
                doi=doi,
                source="oa_fulltext",
                citation_count=pub.citation_count,
                openalex_work_id=pub.openalex_work_id,
                concepts=pub.concepts,
                is_open_access=pub.is_open_access,
                oa_url=pub.oa_url,
            )
        else:
            data = await _unpaywall_lookup(client, doi, email)
            if data is None:
                warnings.append(f"oa_fulltext_unpaywall_miss:{doi}")
                out.append(pub)
                continue
            pdf_url = _pdf_url_from_unpaywall(data)
            if not pdf_url:
                warnings.append(f"oa_fulltext_no_pdf_url:{doi}")
                out.append(pub)
                continue
            pdf_bytes = await _download_pdf(client, pdf_url)
            if not pdf_bytes:
                warnings.append(f"oa_fulltext_download_failed:{doi}")
                out.append(pub)
                continue
            try:
                pdf_path.write_bytes(pdf_bytes)
            except OSError as e:
                logger.warning("Could not write OA PDF cache %s: %s", pdf_path, e)

            ex = extract_publication_from_pdf(
                pdf_bytes,
                max_pages=settings.pdf_max_pages_extract,
                max_chars_abstract=settings.pdf_max_abstract_chars,
                document_ref=doi,
            )
            extracted_pub = ex.publication
            extracted_pub = PublicationInput(
                title=pub.title,
                abstract=extracted_pub.abstract,
                year=pub.year or extracted_pub.year,
                url=pub.url,
                doi=doi,
                source="oa_fulltext",
                citation_count=pub.citation_count,
                openalex_work_id=pub.openalex_work_id,
                concepts=pub.concepts,
                is_open_access=True,
                oa_url=pub.oa_url or pdf_url,
            )
            warnings.extend(ex.warnings)
            _write_cache(
                meta_path,
                {
                    "doi": doi,
                    "title": pub.title,
                    "abstract": extracted_pub.abstract,
                    "year": extracted_pub.year,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                    "pdf_url": pdf_url,
                },
            )

        merged = _merge_longer_abstract(pub, extracted_pub) if extracted_pub else pub
        if merged is not pub and (merged.source or "") == "oa_fulltext":
            fetched += 1
        out.append(merged)

    if fetched:
        logger.info("OA fulltext: enriched %s publications from PDF", fetched)

    return out, warnings, fetched
