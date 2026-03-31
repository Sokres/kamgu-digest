
import logging
import re

import httpx

from digest.config import settings
from digest.models import ConceptRef, PublicationInput
from sources.http_helpers import get_json

logger = logging.getLogger(__name__)

OPENALEX_BASE = "https://api.openalex.org"


def _openalex_work_tail(work_id: str | None) -> str | None:
    if not work_id:
        return None
    tail = str(work_id).rstrip("/").split("/")[-1].strip()
    return tail or None


def _normalize_concept_filter_id(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    if not s:
        return None
    if s.startswith("http"):
        return s
    if re.match(r"^C\d+$", s):
        return f"https://openalex.org/{s}"
    return s


def _normalize_source_filter_id(raw: str) -> str | None:
    s = raw.strip()
    if not s:
        return None
    if s.startswith("http"):
        return s
    if re.match(r"^S\d+$", s):
        return f"https://openalex.org/{s}"
    return s


def build_openalex_filter(
    *,
    peer_reviewed_only: bool,
    from_year: int | None,
    to_year: int | None,
    openalex_concept_id: str | None,
    openalex_source_ids: list[str],
) -> str | None:
    parts: list[str] = []
    if peer_reviewed_only:
        parts.append("type:article")
    if from_year is not None and to_year is not None:
        parts.append(f"publication_year:{from_year}-{to_year}")
    elif from_year is not None:
        parts.append(f"publication_year:{from_year}-2100")
    elif to_year is not None:
        parts.append(f"publication_year:1900-{to_year}")
    cid = _normalize_concept_filter_id(openalex_concept_id)
    if cid:
        parts.append(f"concepts.id:{cid}")
    norm_sources = []
    for sid in openalex_source_ids or []:
        ns = _normalize_source_filter_id(sid)
        if ns:
            norm_sources.append(ns)
    if norm_sources:
        parts.append("primary_location.source.id:" + "|".join(norm_sources))
    if not parts:
        return None
    return ",".join(parts)


def _concepts_from_work(w: dict) -> list[ConceptRef]:
    raw = w.get("concepts") or []
    out: list[ConceptRef] = []
    if not isinstance(raw, list):
        return out
    for c in raw:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id") or "").strip()
        name = str(c.get("display_name") or "").strip()
        sc = c.get("score")
        try:
            score = float(sc) if sc is not None else 0.0
        except (TypeError, ValueError):
            score = 0.0
        if cid or name:
            out.append(ConceptRef(id=cid, display_name=name, score=score))
    out.sort(key=lambda x: x.score, reverse=True)
    return out[:12]


def _reconstruct_abstract(inverted: dict | None) -> str:
    if not inverted:
        return ""
    pairs: list[tuple[int, str]] = []
    for word, positions in inverted.items():
        for pos in positions:
            pairs.append((int(pos), word))
    pairs.sort(key=lambda x: x[0])
    return " ".join(w for _, w in pairs)


def _open_access_from_work(w: dict) -> tuple[bool | None, str | None]:
    oa = w.get("open_access")
    if not isinstance(oa, dict):
        return None, None
    is_oa = oa.get("is_oa")
    if is_oa is not None and not isinstance(is_oa, bool):
        is_oa = bool(is_oa)
    url = (oa.get("oa_url") or "").strip() or None
    return is_oa, url


def _work_to_publication(w: dict) -> PublicationInput | None:
    title = (w.get("display_name") or "").strip()
    if not title:
        return None
    year = w.get("publication_year")
    if year is not None:
        try:
            year = int(year)
        except (TypeError, ValueError):
            year = None
    doi_raw = w.get("doi") or ""
    doi = doi_raw.replace("https://doi.org/", "").strip() or None
    oid = w.get("id") or ""
    oa_tail = _openalex_work_tail(str(oid) if oid else None)
    url = ""
    if oid and str(oid).startswith("http"):
        url = str(oid).strip()
    elif oa_tail:
        url = f"https://openalex.org/{oa_tail}"
    abstract = _reconstruct_abstract(w.get("abstract_inverted_index"))
    cited = w.get("cited_by_count")
    try:
        citation_count = int(cited) if cited is not None else None
    except (TypeError, ValueError):
        citation_count = None
    concepts = _concepts_from_work(w)
    is_oa, oa_url = _open_access_from_work(w)
    return PublicationInput(
        title=title,
        abstract=abstract,
        year=year,
        url=url,
        doi=doi,
        source="openalex",
        citation_count=citation_count,
        openalex_work_id=oa_tail,
        concepts=concepts,
        is_open_access=is_oa,
        oa_url=oa_url,
    )


async def fetch_openalex(
    client: httpx.AsyncClient,
    search_query: str,
    limit: int,
    from_year: int | None,
    to_year: int | None,
    *,
    peer_reviewed_only: bool = True,
    openalex_concept_id: str | None = None,
    openalex_source_ids: list[str] | None = None,
) -> tuple[list[PublicationInput], list[str]]:
    if limit <= 0:
        return [], []
    per_page = min(50, limit)

    filter_str = build_openalex_filter(
        peer_reviewed_only=peer_reviewed_only,
        from_year=from_year,
        to_year=to_year,
        openalex_concept_id=openalex_concept_id,
        openalex_source_ids=list(openalex_source_ids or []),
    )

    url = f"{OPENALEX_BASE}/works"
    out: list[PublicationInput] = []
    page = 1
    try:
        while len(out) < limit:
            params: dict[str, str] = {
                "search": search_query,
                "per-page": str(per_page),
                "page": str(page),
            }
            if filter_str:
                params["filter"] = filter_str
            data = await get_json(
                client,
                url,
                params=params,
                max_attempts=settings.http_max_retries,
            )
            if not data:
                break
            results = data.get("results") or []
            if not results:
                break
            for w in results:
                if not isinstance(w, dict):
                    continue
                pub = _work_to_publication(w)
                if pub:
                    if from_year is not None and pub.year is not None and pub.year < from_year:
                        continue
                    if to_year is not None and pub.year is not None and pub.year > to_year:
                        continue
                    out.append(pub)
                if len(out) >= limit:
                    break
            if len(results) < per_page:
                break
            page += 1
            if page > 5:
                break
    except Exception as e:
        logger.warning("OpenAlex fetch failed: %s", e)
        return [], ["openalex_fetch_failed"]
    return out[:limit], []
