from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    attached_document_ids: list[str] = Field(
        default_factory=list,
        max_length=48,
        description=(
            "Идентификаторы ранее загруженных PDF (POST /documents/pdf). "
            "Учитываются в режиме peer_reviewed; для web_snippets игнорируются."
        ),
    )
    fetch_oa_fulltext: bool = Field(
        False,
        description=(
            "Только peer_reviewed: для открытых публикаций с DOI попытаться скачать OA PDF "
            "(Unpaywall), извлечь текст и передать в LLM (кэш на диске)."
        ),
    )
    deep_digest: bool = Field(
        False,
        description=(
            "Принудительно двухэтапный LLM (краткая выжимка по каждой статье, затем сводный дайджест). "
            "Иначе двухэтапный режим включается автоматически при большом объёме текста."
        ),
    )

    @field_validator("from_year", "to_year", mode="before")
    @classmethod
    def year_zero_means_unset(cls, v: object) -> int | None:
        if v is None:
            return None
        if isinstance(v, int) and v <= 0:
            return None
        return v

    @field_validator("attached_document_ids", mode="before")
    @classmethod
    def normalize_attached_ids(cls, v: object) -> list[str]:
        if v is None:
            return []
        if not isinstance(v, list):
            return []
        out: list[str] = []
        for x in v:
            if isinstance(x, str) and x.strip():
                out.append(x.strip())
        return out[:48]


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
    candidates_core: int = 0
    crossref_enriched_dois: int = Field(
        0,
        description="Число уникальных DOI, по которым подтянуты метаданные Crossref.",
    )
    web_snippets_used: int = Field(
        0,
        description="Для digest_mode=web_snippets: число сниппетов, переданных в LLM.",
    )
    web_scholarly_domain_filter: bool = Field(
        False,
        description="Для web_snippets: к Tavily передан include_domains (ограничение научными сайтами).",
    )
    user_pdf_documents: int = Field(
        0,
        description="Число загруженных PDF, включённых в кандидаты (peer_reviewed).",
    )
    after_dedupe: int = 0
    used_for_llm: int = 0
    elapsed_seconds: float = 0.0
    warnings: list[str] = Field(
        default_factory=list,
        description="Например, сбой HTTP к источнику (частичный или пустой результат).",
    )
    oa_fulltext_fetched: int = Field(
        0,
        description="Число работ, для которых подтянут и разобран OA PDF (peer_reviewed + fetch_oa_fulltext).",
    )
    two_stage_llm: bool = Field(
        False,
        description="Использован ли двухэтапный LLM (map-reduce) вместо одного запроса.",
    )


class PdfDocumentUploadResponse(BaseModel):
    """Ответ POST /documents/pdf после сохранения и извлечения текста."""

    id: str
    publication: PublicationInput
    warnings: list[str] = Field(default_factory=list)


class DigestResponse(BaseModel):
    publications_used: list[PublicationInput]
    article_cards: list[ArticleCard]
    digest_ru: str
    digest_en: str
    meta: DigestMeta = Field(default_factory=DigestMeta)


class SavedDigestEnvelope(BaseModel):
    """Тело payload_json в saved_digests."""

    version: Literal[1] = 1
    digest_response: DigestResponse | None = None
    monthly_digest: MonthlyDigestResponse | None = None
    request: DigestRequest | None = None
    monthly_request: MonthlyDigestRequest | None = None

    def resolved_digest_response(self) -> DigestResponse:
        if self.digest_response is not None:
            return self.digest_response
        if self.monthly_digest is not None:
            m = self.monthly_digest
            return DigestResponse(
                publications_used=m.publications_used,
                article_cards=m.article_cards,
                digest_ru=m.digest_ru,
                digest_en=m.digest_en,
                meta=m.meta,
            )
        raise ValueError("saved digest has no response body")


class SavedDigestCreate(BaseModel):
    """POST /saved-digests."""

    title: str = Field(..., min_length=1, max_length=200)
    digest_response: DigestResponse | None = None
    monthly_digest: MonthlyDigestResponse | None = None
    request_snapshot: DigestRequest | None = None
    monthly_request_snapshot: MonthlyDigestRequest | None = None

    @model_validator(mode="after")
    def require_one_digest(self) -> SavedDigestCreate:
        if self.digest_response is None and self.monthly_digest is None:
            raise ValueError("Нужен digest_response или monthly_digest.")
        return self


class SavedDigestListItem(BaseModel):
    id: str
    title: str
    created_at: str
    digest_mode: DigestMode = "peer_reviewed"
    used_for_llm: int | None = None
    elapsed_seconds: float | None = None
    public_share_active: bool = False


class SavedDigestOut(BaseModel):
    id: str
    title: str
    created_at: str
    digest_response: DigestResponse
    monthly_digest: MonthlyDigestResponse | None = None
    request_snapshot: DigestRequest | None = None
    monthly_request_snapshot: MonthlyDigestRequest | None = None
    public_share_active: bool = False


class SavedDigestCreated(BaseModel):
    id: str
    created_at: str


class SavedDigestShareResponse(BaseModel):
    token: str
    public_path: str = Field(description="Путь API: GET /public/saved-digests/{token}")


class DigestScheduleRunOut(BaseModel):
    id: str
    schedule_id: str
    user_id: str
    finished_at: str
    status: str
    message: str | None = None


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

    Используйте POST /digests/periodic (или устаревший /digests/monthly). Частоту можно
    задать внешним cron или встроенным планировщиком (см. DIGEST_PERIODIC_SCHEDULER_ENABLED
    и POST /digests/schedules), если на сервере один процесс uvicorn.

    Загруженные PDF (POST /documents/pdf) в этом запросе не поддерживаются: периодический
    дайджест строится из внешних источников — OpenAlex/Semantic Scholar или веб-сниппеты
    (Tavily), как у POST /digests.
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
    digest_mode: DigestMode = Field(
        "peer_reviewed",
        description="Как у POST /digests: peer_reviewed или web_snippets (Tavily).",
    )
    web_scholarly_sources_only: bool = Field(
        True,
        description="Для web_snippets: только научные домены (include_domains у Tavily).",
    )
    web_search_additional_terms: list[str] = Field(
        default_factory=list,
        description="Доп. ключи к запросу Tavily (web_snippets).",
    )
    from_year: int | None = Field(None, description="Минимальный год публикации")
    to_year: int | None = Field(None, description="Максимальный год публикации")
    exclude_dois: list[str] = Field(default_factory=list)
    force_period: str | None = Field(
        None,
        description="Переопределить период снимка YYYY-MM (UTC), иначе текущий месяц.",
    )
    fetch_oa_fulltext: bool = Field(
        False,
        description="Только peer_reviewed: при наличии DOI подтянуть OA PDF (Unpaywall) для LLM. Для web_snippets игнорируется.",
    )
    deep_digest: bool = Field(
        False,
        description="Как у POST /digests: принудительный двухэтапный LLM.",
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


class PeriodicDigestScheduleParams(BaseModel):
    """Параметры дайджеста в записи расписания (без profile_id и force_period)."""

    topic_queries: list[str] = Field(
        ...,
        min_length=1,
        description="Как у POST /digests/periodic.",
    )
    digest_mode: DigestMode = Field("peer_reviewed")
    web_scholarly_sources_only: bool = True
    web_search_additional_terms: list[str] = Field(default_factory=list)
    fetch_oa_fulltext: bool = False
    deep_digest: bool = False
    max_candidates: int = Field(100, ge=10, le=200)
    top_n_for_llm: int = Field(20, ge=3, le=40)
    trend_top_k: int = Field(20, ge=5, le=60)
    from_year: int | None = Field(None, description="Минимальный год публикации")
    to_year: int | None = Field(None, description="Максимальный год публикации")
    exclude_dois: list[str] = Field(default_factory=list)

    @field_validator("from_year", "to_year", mode="before")
    @classmethod
    def year_zero_means_unset_schedule(cls, v: object) -> int | None:
        if v is None:
            return None
        if isinstance(v, int) and v <= 0:
            return None
        return v


class PeriodicDigestScheduleCreate(BaseModel):
    profile_id: str = Field(..., min_length=1, max_length=128)
    cron_utc: str = Field(
        ...,
        min_length=9,
        description="Crontab в UTC (5 полей): минута час день_месяца месяц день_недели. Пример: «0 6 1 * *» — 1-го числа в 06:00 UTC.",
    )
    enabled: bool = True
    topic_queries: list[str] = Field(..., min_length=1)
    digest_mode: DigestMode = Field("peer_reviewed")
    web_scholarly_sources_only: bool = True
    web_search_additional_terms: list[str] = Field(default_factory=list)
    fetch_oa_fulltext: bool = False
    deep_digest: bool = False
    max_candidates: int = Field(100, ge=10, le=200)
    top_n_for_llm: int = Field(20, ge=3, le=40)
    trend_top_k: int = Field(20, ge=5, le=60)
    from_year: int | None = None
    to_year: int | None = None
    exclude_dois: list[str] = Field(default_factory=list)

    @field_validator("from_year", "to_year", mode="before")
    @classmethod
    def year_zero_means_unset_create(cls, v: object) -> int | None:
        if v is None:
            return None
        if isinstance(v, int) and v <= 0:
            return None
        return v


class PeriodicDigestScheduleUpdate(BaseModel):
    cron_utc: str | None = None
    enabled: bool | None = None
    topic_queries: list[str] | None = Field(None, min_length=1)
    digest_mode: DigestMode | None = None
    web_scholarly_sources_only: bool | None = None
    web_search_additional_terms: list[str] | None = None
    fetch_oa_fulltext: bool | None = None
    deep_digest: bool | None = None
    max_candidates: int | None = Field(None, ge=10, le=200)
    top_n_for_llm: int | None = Field(None, ge=3, le=40)
    trend_top_k: int | None = Field(None, ge=5, le=60)
    from_year: int | None = None
    to_year: int | None = None
    exclude_dois: list[str] | None = None

    @field_validator("from_year", "to_year", mode="before")
    @classmethod
    def year_zero_means_unset_update(cls, v: object) -> int | None:
        if v is None:
            return None
        if isinstance(v, int) and v <= 0:
            return None
        return v


class PeriodicDigestScheduleOut(BaseModel):
    id: str
    user_id: str = ""
    profile_id: str
    cron_utc: str
    enabled: bool
    topic_queries: list[str]
    digest_mode: DigestMode = "peer_reviewed"
    web_scholarly_sources_only: bool = True
    web_search_additional_terms: list[str] = Field(default_factory=list)
    fetch_oa_fulltext: bool = False
    deep_digest: bool = False
    max_candidates: int
    top_n_for_llm: int
    trend_top_k: int
    from_year: int | None = None
    to_year: int | None = None
    exclude_dois: list[str] = Field(default_factory=list)
    created_at: str
    updated_at: str
    last_run_at: str | None = None
    last_status: str | None = None
    last_error: str | None = None


class DigestSchedulesListResponse(BaseModel):
    items: list[PeriodicDigestScheduleOut]
    scheduler_enabled_in_config: bool = Field(
        ...,
        description="DIGEST_PERIODIC_SCHEDULER_ENABLED в .env",
    )
    scheduler_running: bool = Field(
        ...,
        description="Планировщик запущен в этом процессе (AsyncIOScheduler).",
    )


class TrendProfileSummary(BaseModel):
    """Сводка по направлению (digest_profiles + опционально снимки)."""

    user_id: str = ""
    profile_id: str
    snapshot_count: int = 0
    last_period: str | None = Field(
        None,
        description="Период последнего снимка; None, если снимков ещё не было.",
    )
    last_created_at: str | None = Field(
        None,
        description="Время создания последнего снимка.",
    )
    topic_queries: list[str] = Field(default_factory=list)
    work_count_last: int = Field(
        0,
        description="Число работ в последнем снимке (длина works в payload).",
    )
    display_name: str | None = Field(
        None,
        description="Человекочитаемое имя направления (digest_profiles).",
    )
    note: str = ""


class DigestProfileCreate(BaseModel):
    """POST /trends/profiles — создание направления."""

    display_name: str = Field(..., min_length=1, max_length=160)
    note: str = Field("", max_length=2000)


class DigestProfileCreated(BaseModel):
    profile_id: str
    display_name: str
    note: str = ""
    created_at: str


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


class TrendSnapshotDetail(BaseModel):
    """GET /trends/profiles/{profile_id}/snapshots/{period} — сохранённый снимок."""

    profile_id: str
    period: str
    created_at: str
    topic_queries: list[str] = Field(default_factory=list)
    work_count: int = 0
    digest_available: bool = False
    digest_ru: str = ""
    digest_en: str = ""
    publications_used: list[PublicationInput] = Field(default_factory=list)
    article_cards: list[ArticleCard] = Field(default_factory=list)
    structured_delta: MonthlyStructuredDelta | None = None
    meta: MonthlyDigestMeta | None = None
    works: list[SnapshotWorkRecord] = Field(default_factory=list)


class TrendCitationGainHighlight(BaseModel):
    title: str
    delta: int


class TrendConceptShiftHighlight(BaseModel):
    name: str
    delta: float


class TrendPeriodHighlight(BaseModel):
    period: str
    created_at: str
    work_count: int
    is_baseline: bool = False
    compared_period: str | None = None
    entered_count: int = 0
    left_count: int = 0
    top_citation_gain: TrendCitationGainHighlight | None = None
    top_concept_shift: TrendConceptShiftHighlight | None = None


class TrendConceptEvolutionPoint(BaseModel):
    period: str
    shares: dict[str, float] = Field(default_factory=dict)


class TrendLatestSnapshotSummary(BaseModel):
    period: str
    created_at: str
    digest_available: bool = False
    digest_ru: str = ""
    digest_en: str = ""
    structured_delta: MonthlyStructuredDelta | None = None


class TrendHighlightsResponse(BaseModel):
    profile_id: str
    topic_queries: list[str] = Field(default_factory=list)
    points: list[TrendPeriodHighlight] = Field(default_factory=list)
    latest_snapshot: TrendLatestSnapshotSummary | None = None
    concept_evolution: list[TrendConceptEvolutionPoint] = Field(default_factory=list)


class TrendAnalysisResponse(BaseModel):
    profile_id: str
    analyzed_through_period: str | None = None
    analysis_ru: str = ""
    analysis_en: str = ""
    overview_ru: str = ""
    overview_en: str = ""
    cached: bool = False
    snapshot_count: int = 0


class TrendProfileLabelUpdate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=160)
    note: str = Field("", max_length=2000)


class AuthStatusResponse(BaseModel):
    auth_enabled: bool
    registration_enabled: bool


class AuthRegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=8, max_length=256)

    @field_validator("password")
    @classmethod
    def password_bcrypt_utf8_bytes(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError(
                "Пароль не длиннее 72 байт в UTF-8 (ограничение bcrypt). Укоротите пароль."
            )
        return v


class AuthLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)

    @field_validator("password")
    @classmethod
    def password_bcrypt_utf8_bytes_login(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Пароль не длиннее 72 байт в UTF-8.")
        return v


class AuthChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=8, max_length=256)

    @field_validator("current_password", "new_password")
    @classmethod
    def password_bcrypt_utf8_bytes_change(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError(
                "Пароль не длиннее 72 байт в UTF-8 (ограничение bcrypt). Укоротите пароль."
            )
        return v


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    refresh_token: str
    user_id: str
    username: str


class AuthRefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=16, max_length=2048)


class AuthLogoutRequest(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=2048)


class AuthMeResponse(BaseModel):
    user_id: str
    username: str
