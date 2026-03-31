import re

from digest.models import PublicationInput


def _tokens(text: str) -> set[str]:
    # Unicode-aware \w (без re.ASCII) — подходит для смешанных RU/EN запросов.
    return set(re.findall(r"[\w']+", text.lower()))


def query_tokens(topic_queries: list[str]) -> set[str]:
    acc: set[str] = set()
    for q in topic_queries:
        acc |= _tokens(q)
    return acc


def score_publication(p: PublicationInput, qtok: set[str]) -> float:
    if not qtok:
        return 0.0
    title_t = _tokens(p.title)
    abs_t = _tokens(p.abstract)
    text = _tokens(p.title + " " + p.abstract)
    overlap = len(qtok & text)
    in_title = len(qtok & title_t)
    cite = (p.citation_count or 0) * 0.0005
    return overlap + in_title * 2.0 + cite


def rank_for_llm(
    pubs: list[PublicationInput],
    topic_queries: list[str],
    top_n: int,
) -> list[PublicationInput]:
    qtok = query_tokens(topic_queries)
    scored = sorted(pubs, key=lambda p: score_publication(p, qtok), reverse=True)
    return scored[:top_n]
