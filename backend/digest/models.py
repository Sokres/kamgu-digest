from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


DigestMode = Literal["peer_reviewed", "web_snippets"]


class ConceptRef(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = ""
    display_name: str = ""
    score: float = 0.0


class DigestRequest(BaseModel):
    """Профиль направления и параметры выборки."""

    topic_queries: list[str] = Field(
        ...,
        min_length=1,
        description="Поисковые строки на EN и/или RU (объединяются для скоринга).",
    )
    digest_mode: DigestMode = Field(
        "peer_reviewed",
        description="peer_reviewed: OpenAlex/Semantic Scholar. web_snippets: веб-поиск (сниппеты), отдельный дисклеймер.",
    )
    max_candidates: int = Field(100, ge=10, le=200)
    top_n_for_llm: int = Field(20, ge=3, le=40)
    from_year: int | None = Field(None, description="Минимальный год публикации")
    to_year: int | None = Field(None, description="Максимальный год публикации")
    exclude_dois: list[str] = Field(default_factory=list)
    peer_reviewed_only: bool = Field(
        True,
        description="Для peer_reviewed: в OpenAlex фильтр type:article (журнальные статьи).",
    )
    openalex_concept_id: str | None = Field(
        None,
        description="Опционально: OpenAlex concept id (C2778805519 или полный URL openalex.org/C...).",
    )
    openalex_source_ids: list[str] = Field(
        default_factory=list,
        description="Опционально: ограничить журналы/источники (S123... или полный URL), несколько — ИЛИ.",
    )
    web_scholarly_sources_only: bool = Field(
        True,
        description="Для web_snippets: искать только в научных доменах (Tavily include_domains), не по всему интернету.",
    )
    web_search_additional_terms: list[str] = Field(
        default_factory=list,
        description="Дополнительные ключевые слова к строке поиска Tavily (web_snippets).",
    )

    @field_validator("from_year", "to_year", mode="before")
    @classmethod
    def year_zero_means_unset(cls, v: object) -> int | None:
        if v is None:
            return None
        if isinstance(v, int) and v <= 0:
            return None
        return v


class PublicationInput(BaseModel):
    """Нормализованная публикация до/после отбора (для ответа и для LLM)."""

    title: str
    abstract: str = ""
    year: int | None = None
    url: str = ""
    doi: str | None = None
    source: str = ""
    citation_count: int | None = None
    openalex_work_id: str | None = None
    concepts: list[ConceptRef] = Field(default_factory=list)
    is_open_access: bool | None = None
    oa_url: str | None = Field(None, description="Лучшая открытая ссылка из OpenAlex, если есть.")


class ArticleCard(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    url: str = ""
    year: int | None = None
    bullets: list[str] = Field(default_factory=list, description="2–3 тезиса по abstract")
    why_relevant: str = ""


class DigestLLMResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    overview_ru: str = ""
    overview_en: str = ""
    article_cards: list[ArticleCard] = Field(default_factory=list)
    digest_ru: str = ""
    digest_en: str = ""


class DigestMeta(BaseModel):
    """Счётчики и служебные поля ответа `/digests`."""

    digest_mode: DigestMode = "peer_reviewed"
    candidates_openalex: int = 0
    candidates_semantic_scholar: int = 0
    web_snippets_used: int = Field(
        0,
        description="Для digest_mode=web_snippets: число сниппетов, переданных в LLM.",
    )
    web_scholarly_domain_filter: bool = Field(
        False,
        description="Для web_snippets: к Tavily передан include_domains (ограничение научными сайтами).",
    )
    after_dedupe: int = 0
    used_for_llm: int = 0
    elapsed_seconds: float = 0.0
    warnings: list[str] = Field(
        default_factory=list,
        description="Например, сбой HTTP к источнику (частичный или пустой результат).",
    )


class DigestResponse(BaseModel):
    publications_used: list[PublicationInput]
    article_cards: list[ArticleCard]
    digest_ru: str
    digest_en: str
    meta: DigestMeta = Field(default_factory=DigestMeta)


class SnapshotWorkRecord(BaseModel):
    """Одна работа в ежемесячном снимке (сериализуется в payload_json)."""

    dedupe_key: str
    title: str
    year: int | None = None
    doi: str | None = None
    openalex_work_id: str | None = None
    citation_count: int | None = None
    rank: int = Field(..., ge=1, description="1-based ранг после rank_for_llm")
    concepts: list[ConceptRef] = Field(default_factory=list)


class MonthlyDigestRequest(BaseModel):
    """Периодический дайджест со снимками и трендами (нужна БД снимков).

    Используйте POST /digests/periodic (или устаревший /digests/monthly). Периодичность
    (месяц, квартал и т.д.) задаётся внешним cron/планировщиком, не этим API.
    """

    profile_id: str = Field(..., min_length=1, max_length=128)
    topic_queries: list[str] = Field(
        ...,
        min_length=1,
        description="Как у /digests — строки для поиска и скоринга.",
    )
    max_candidates: int = Field(100, ge=10, le=200)
    top_n_for_llm: int = Field(20, ge=3, le=40)
    trend_top_k: int = Field(
        20,
        ge=5,
        le=60,
        description="Размер множества 'топ' для вошёл/вышел (ранги 1..K).",
    )
    from_year: int | None = Field(None, description="Минимальный год публикации")
    to_year: int | None = Field(None, description="Максимальный год публикации")
    exclude_dois: list[str] = Field(default_factory=list)
    force_period: str | None = Field(
        None,
        description="Переопределить период снимка YYYY-MM (UTC), иначе текущий месяц.",
    )

    @field_validator("force_period")
    @classmethod
    def force_period_format(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if len(s) != 7 or s[4] != "-":
            raise ValueError("force_period must be YYYY-MM")
        y, m = s.split("-", 1)
        if not y.isdigit() or not m.isdigit():
            raise ValueError("force_period must be YYYY-MM")
        mi = int(m)
        if mi < 1 or mi > 12:
            raise ValueError("force_period month must be 01-12")
        return s

    @field_validator("from_year", "to_year", mode="before")
    @classmethod
    def year_zero_means_unset_monthly(cls, v: object) -> int | None:
        if v is None:
            return None
        if isinstance(v, int) and v <= 0:
            return None
        return v


class WorkCitationDelta(BaseModel):
    dedupe_key: str
    title: str
    citation_previous: int | None = None
    citation_current: int | None = None
    citation_delta: int | None = None
    rank_previous: int | None = None
    rank_current: int | None = None


class ConceptShareDelta(BaseModel):
    concept_name: str
    share_previous: float | None = None
    share_current: float | None = None
    delta: float | None = None


class MonthlyStructuredDelta(BaseModel):
    """Детерминированный дифф для UI и для LLM."""

    profile_id: str
    current_period: str
    compared_period: str | None = None
    is_baseline: bool = False
    top_by_citation_gain: list[WorkCitationDelta] = Field(default_factory=list)
    entered_top_k: list[WorkCitationDelta] = Field(default_factory=list)
    left_top_k: list[WorkCitationDelta] = Field(default_factory=list)
    concept_share_deltas: list[ConceptShareDelta] = Field(default_factory=list)


class MonthlyDigestMeta(DigestMeta):
    profile_id: str = ""
    period: str = ""
    compared_period: str | None = None
    snapshot_saved: bool = False


class MonthlyDigestResponse(BaseModel):
    publications_used: list[PublicationInput]
    article_cards: list[ArticleCard]
    digest_ru: str
    digest_en: str
    structured_delta: MonthlyStructuredDelta
    meta: MonthlyDigestMeta = Field(default_factory=MonthlyDigestMeta)


class TrendProfileSummary(BaseModel):
    """Сводка по profile_id из digest_snapshots + опциональная подпись."""

    profile_id: str
    snapshot_count: int
    last_period: str
    last_created_at: str
    topic_queries: list[str] = Field(default_factory=list)
    work_count_last: int = Field(
        0,
        description="Число работ в последнем снимке (длина works в payload).",
    )
    display_name: str | None = Field(
        None,
        description="Человекочитаемое имя из trend_profile_labels.",
    )
    note: str = ""


class TrendSeriesPoint(BaseModel):
    period: str
    created_at: str
    work_count: int
    topic_queries: list[str] = Field(default_factory=list)
    delta_vs_prev: int | None = None
    pct_change_vs_prev: float | None = None


class TrendSeriesResponse(BaseModel):
    profile_id: str
    points: list[TrendSeriesPoint]


class TrendProfileLabelUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=160)
    note: str = Field("", max_length=2000)
