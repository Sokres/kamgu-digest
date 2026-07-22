from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = ""
    openrouter_api_key: str = ""
    openai_base_url: str | None = None
    openai_model: str = "gpt-4o-mini"
    # OpenRouter :free часто без json_mode — тогда false.
    openai_response_format_json: bool = True

    openrouter_http_referer: str | None = None
    openrouter_app_title: str = "KamGU Research Digest"
    llm_max_retries: int = 8
    llm_retry_base_seconds: float = 4.0
    llm_max_abstract_chars_per_pub: int = 12_000
    llm_max_abstract_chars_longtext: int = 24_000
    llm_digest_prompt_budget_chars: int = 900_000
    llm_digest_two_stage_min_pubs: int = 8
    llm_digest_map_concurrency: int = 3
    llm_max_completion_tokens: int = 16_384
    llm_timeout_seconds: float = 600.0
    unpaywall_email: str = ""
    oa_fulltext_cache_dir: str = "data/oa_fulltext_cache"
    oa_fulltext_max_per_digest: int = 8
    oa_fulltext_max_download_bytes: int = 25 * 1024 * 1024

    # Пусто → openalex_mailto или дефолтный UA (иначе SS/CDN часто 403).
    http_user_agent: str = ""
    http_timeout_seconds: float = 30.0
    http_max_retries: int = 5
    source_stagger_seconds: float = 1.5
    semantic_scholar_page_delay_seconds: float = 5.0
    semantic_scholar_api_key: str | None = None
    semantic_scholar_enabled: bool = False
    semantic_scholar_max_retries: int = 12
    openalex_mailto: str | None = None
    openalex_api_key: str = ""

    core_api_key: str = ""
    core_enabled: bool = False
    core_request_delay_seconds: float = 10.5
    core_max_pages: int = 5

    crossref_enrichment_enabled: bool = True
    crossref_max_unique_dois: int = 80

    tavily_api_key: str | None = None
    web_search_max_results: int = 15
    tavily_include_domains: str = ""
    tavily_query_prefix: str = ""

    log_level: str = "INFO"

    # SQLite по умолчанию: без Docker/Postgres /auth/login не падает с 503.
    snapshot_database_url: str = "sqlite:///./snapshots.db"
    # Только при одном воркере uvicorn.
    digest_periodic_scheduler_enabled: bool = False
    monthly_digest_cron_secret: str = ""

    digest_rate_limit_per_minute: int = 0
    saved_digest_max_payload_bytes: int = 4 * 1024 * 1024
    saved_digest_title_max_length: int = 200

    documents_storage_dir: str = "data/documents"
    pdf_max_upload_bytes: int = 20 * 1024 * 1024
    pdf_max_pages_extract: int = 80
    pdf_max_abstract_chars: int = 50_000

    # Пустая строка в .env → подставляются dev-origins (иначе ломается localhost:5173).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    auth_enabled: bool = False
    auth_jwt_secret: str = ""
    auth_jwt_expire_minutes: int = 60 * 24 * 7
    auth_access_token_expire_minutes: int | None = None
    auth_refresh_token_expire_days: int = 30
    auth_registration_enabled: bool = True
    auth_legacy_user_id: str = "__legacy__"

    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    digest_notify_from_email: str = ""
    digest_notify_to_email: str = ""

    digest_schedule_webhook_url: str = ""
    digest_schedule_webhook_secret: str = ""

    def llm_api_key_resolved(self) -> str:
        a = (self.openai_api_key or "").strip()
        b = (self.openrouter_api_key or "").strip()
        base = (self.openai_base_url or "").strip().lower()
        # При OpenRouter не брать openai-ключ раньше openrouter — иначе 401 при смешанном .env.
        if "openrouter" in base:
            return b or a
        return a or b

    def unpaywall_email_resolved(self) -> str:
        e = (self.unpaywall_email or "").strip()
        if e:
            return e
        return (self.openalex_mailto or "").strip()

    def llm_api_key_source_label(self) -> str:
        a = (self.openai_api_key or "").strip()
        b = (self.openrouter_api_key or "").strip()
        base = (self.openai_base_url or "").strip().lower()
        if "openrouter" in base:
            if b:
                return "openrouter_api_key"
            if a:
                return "openai_api_key"
            return "none"
        if a:
            return "openai_api_key"
        if b:
            return "openrouter_api_key"
        return "none"

    def http_client_headers(self) -> dict[str, str]:
        ua = (self.http_user_agent or "").strip()
        if not ua:
            m = (self.openalex_mailto or "").strip()
            if m:
                ua = f"KamGU-ResearchDigest/1.0 (mailto:{m})"
            else:
                ua = (
                    "KamGU-ResearchDigest/1.0 "
                    "(academic; set OPENALEX_MAILTO or HTTP_USER_AGENT if APIs return 403)"
                )
        return {"User-Agent": ua}

    def cors_origins_list(self) -> list[str]:
        raw = (self.cors_origins or "").strip()
        if not raw:
            raw = "http://localhost:5173,http://127.0.0.1:5173"
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
