import re

from digest.models import PublicationInput


def publication_dedupe_key(p: PublicationInput) -> str:
    """Стабильный ключ для снимков и диффа (DOI / OpenAlex / заголовок)."""
    nd = normalize_doi(p.doi)
    if nd:
        return f"doi:{nd}"
    if (p.openalex_work_id or "").strip():
        tail = (p.openalex_work_id or "").strip().rstrip("/").split("/")[-1]
        return f"oa:{tail.lower()}"
    return f"title:{normalize_title(p.title)}"


def merge_publications(a: PublicationInput, b: PublicationInput) -> PublicationInput:
    """Объединить две записи об одной работе (разные источники)."""
    primary, secondary = (
        (a, b) if len(a.abstract or "") >= len(b.abstract or "") else (b, a)
    )
    cite_p = primary.citation_count
    cite_s = secondary.citation_count
    if cite_p is not None and cite_s is not None:
        citation = max(cite_p, cite_s)
    else:
        citation = cite_p if cite_p is not None else cite_s
    if len(primary.concepts) >= len(secondary.concepts):
        concepts = list(primary.concepts)
    else:
        concepts = list(secondary.concepts)
    if not concepts:
        concepts = list(primary.concepts or secondary.concepts)
    oa_id = primary.openalex_work_id or secondary.openalex_work_id
    doi_val = primary.doi or secondary.doi
    oa_url = (primary.oa_url or secondary.oa_url or "").strip() or None
    is_open = primary.is_open_access
    if is_open is None:
        is_open = secondary.is_open_access
    return PublicationInput(
        title=primary.title or secondary.title,
        abstract=primary.abstract or secondary.abstract,
        year=primary.year if primary.year is not None else secondary.year,
        url=primary.url or secondary.url,
        doi=doi_val,
        source=primary.source,
        citation_count=citation,
        openalex_work_id=oa_id,
        concepts=list(concepts) if concepts else [],
        is_open_access=is_open,
        oa_url=oa_url,
    )


def normalize_doi(d: str | None) -> str | None:
    if not d:
        return None
    x = d.strip().lower().replace("https://doi.org/", "").strip()
    return x or None


def normalize_title(t: str) -> str:
    return " ".join(re.sub(r"[^\w\s]", " ", t.lower()).split())


def dedupe_publications(
    pubs: list[PublicationInput],
    exclude_dois: set[str],
) -> list[PublicationInput]:
    exclude_norm = {normalize_doi(x) for x in exclude_dois if normalize_doi(x)}
    by_doi: dict[str, PublicationInput] = {}

    for p in pubs:
        nd = normalize_doi(p.doi)
        if nd and nd in exclude_norm:
            continue
        if nd:
            cur = by_doi.get(nd)
            if cur is None:
                by_doi[nd] = p
            else:
                by_doi[nd] = merge_publications(cur, p)

    merged = list(by_doi.values())
    titles = {normalize_title(x.title) for x in merged}

    for p in pubs:
        nd = normalize_doi(p.doi)
        if nd:
            continue
        nt = normalize_title(p.title)
        if nt in titles:
            continue
        merged.append(p)
        titles.add(nt)

    return merged
