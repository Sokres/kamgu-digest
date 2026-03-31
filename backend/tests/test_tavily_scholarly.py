from sources.tavily import DEFAULT_SCHOLARLY_DOMAINS, build_tavily_query


def test_default_scholarly_domains_nonempty():
    assert len(DEFAULT_SCHOLARLY_DOMAINS) >= 5
    assert "arxiv.org" in DEFAULT_SCHOLARLY_DOMAINS
    assert "pubmed.ncbi.nlm.nih.gov" in DEFAULT_SCHOLARLY_DOMAINS


def test_build_tavily_query_joins_additional_terms(monkeypatch):
    from digest import config

    monkeypatch.setattr(config.settings, "tavily_query_prefix", "")
    q = build_tavily_query("quantum battery", ["review", "2024"])
    assert "quantum battery" in q
    assert "review" in q
    assert "2024" in q
