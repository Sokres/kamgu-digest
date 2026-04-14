"""Извлечение текста и метаданных из PDF (PyMuPDF)."""

from __future__ import annotations

import re
from dataclasses import dataclass

import fitz  # PyMuPDF

from digest.models import PublicationInput

# DOI: типичный вид в тексте статьи
_DOI_RE = re.compile(
    r"\b(10\.\d{4,9}/[^\s\]\)\"\'>]+)\b",
    re.IGNORECASE,
)
_YEAR_RE = re.compile(r"\b(19\d{2}|20[0-3]\d)\b")


@dataclass(frozen=True)
class PdfExtractResult:
    publication: PublicationInput
    warnings: list[str]
    pages_used: int


def _guess_year_from_text(text: str) -> int | None:
    for m in _YEAR_RE.finditer(text[:8000]):
        try:
            y = int(m.group(1))
            if 1900 <= y <= 2035:
                return y
        except ValueError:
            continue
    return None


def _first_meaningful_line(text: str) -> str:
    for line in text.splitlines():
        s = line.strip()
        if len(s) >= 8 and not s.lower().startswith("doi:"):
            return s[:500]
    return ""


def extract_publication_from_pdf(
    data: bytes,
    *,
    max_pages: int,
    max_chars_abstract: int,
    document_ref: str = "",
) -> PdfExtractResult:
    """
    Строит PublicationInput из PDF: метаданные документа, текст первых страниц,
    эвристика DOI и года. При почти пустом тексте (скан) — предупреждение.
    """
    warnings: list[str] = []
    doc = fitz.open(stream=data, filetype="pdf")
    try:
        n_pages = doc.page_count
        if n_pages <= 0:
            warnings.append("pdf_no_pages")
            title = document_ref or "PDF (пустой документ)"
            return PdfExtractResult(
                publication=PublicationInput(
                    title=title,
                    abstract="",
                    source="user_pdf",
                    url="",
                ),
                warnings=warnings,
                pages_used=0,
            )

        use_pages = min(n_pages, max(1, max_pages))
        if n_pages > max_pages:
            warnings.append(f"pdf_truncated_pages:{use_pages}_of_{n_pages}")

        meta = doc.metadata or {}
        meta_title = (meta.get("title") or "").strip()
        author = (meta.get("author") or "").strip()

        parts: list[str] = []
        for i in range(use_pages):
            page = doc.load_page(i)
            parts.append(page.get_text("text") or "")
        full_text = "\n".join(parts)
        collapsed = re.sub(r"\s+", " ", full_text).strip()

        if len(collapsed) < 120:
            warnings.append("pdf_little_extractable_text_scan_or_empty")

        head = collapsed[:12000]
        doi_match = _DOI_RE.search(head)
        doi = None
        if doi_match:
            raw_doi = doi_match.group(1).rstrip(".,;:)")
            doi = raw_doi.lower() if raw_doi else None

        title = meta_title
        if not title:
            title = _first_meaningful_line(full_text)
        if not title:
            title = document_ref or "Загруженная статья (PDF)"

        year = _guess_year_from_text(head)
        if meta.get("creationDate") or meta.get("modDate"):
            # PDF date often like D:20230101120000
            dm = (meta.get("creationDate") or meta.get("modDate") or "")[:16]
            ym = re.search(r"(19\d{2}|20\d{2})", dm)
            if ym:
                try:
                    y = int(ym.group(1))
                    if 1900 <= y <= 2035:
                        year = year or y
                except ValueError:
                    pass

        abstract = collapsed[:max_chars_abstract]
        if author and author.lower() not in title.lower():
            abstract = f"(Author: {author}) {abstract}".strip()[:max_chars_abstract]

        pub = PublicationInput(
            title=title[:2000],
            abstract=abstract,
            year=year,
            url="",
            doi=doi,
            source="user_pdf",
        )
        return PdfExtractResult(publication=pub, warnings=warnings, pages_used=use_pages)
    finally:
        doc.close()
