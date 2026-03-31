from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    openai_api_key: str = ""
    # Альтернатива: ключ только OpenRouter (удобнее не смешивать с OpenAI в одной переменной).
    openrouter_api_key: str = ""
    openai_base_url: str | None = None
    openai_model: str = "gpt-4o-mini"
    # Для OpenRouter :free моделей часто нет json_mode — выставьте false.
    openai_response_format_json: bool = True

    # Опционально для OpenRouter (ранги на openrouter.ai)
    openrouter_http_referer: str | None = None
    openrouter_app_title: str = "KamGU Research Digest"
    # Ретраи при 429 у OpenRouter / провайдера (:free модели часто «upstream rate limited»).
    llm_max_retries: int = 8
    llm_retry_base_seconds: float = 4.0

    # Semantic Scholar / часть CDN режут запросы без нормального User-Agent → 403.
    # Пусто = см. openalex_mailto или строка по умолчанию.
    http_user_agent: str = ""
    http_timeout_seconds: float = 30.0
    http_max_retries: int = 5
    # Секунды между запросами к разным источникам (снижает 429 у Semantic Scholar).
    source_stagger_seconds: float = 1.5
    # Пауза перед 2-й и следующими страницами поиска Semantic Scholar (пагинация режется по лимитам).
    semantic_scholar_page_delay_seconds: float = 5.0
    # Опционально: https://www.semanticscholar.org/product/api — выше лимиты, меньше 429.
    semantic_scholar_api_key: str | None = None
    semantic_scholar_enabled: bool = False
    semantic_scholar_max_retries: int = 12
    openalex_mailto: str | None = None

    # Веб-обзор по сниппетам (режим digest_mode=web_snippets): https://tavily.com
    tavily_api_key: str | None = None
    web_search_max_results: int = 15
    # Список доменов через запятую для Tavily include_domains (пусто = встроенный научный список в sources/tavily.py)
    tavily_include_domains: str = ""
    # Необязательный префикс к запросу (например «peer-reviewed»), чтобы сместить выдачу к статьям
    tavily_query_prefix: str = ""

    log_level: str = "INFO"

    # Ежемесячные снимки: PostgreSQL (прод/крон) или SQLite без Docker — см. SNAPSHOT_DATABASE_URL в README
    snapshot_database_url: str = "postgresql://postgres:postgres@127.0.0.1:5432/kamgu_digest"
    # Если задан — POST /digests/monthly и /digests/periodic требуют заголовок X-Internal-Key с тем же значением.
    monthly_digest_cron_secret: str = ""

    # Лимит POST /digests на один IP за скользящее окно 60 с (0 = отключено).
    digest_rate_limit_per_minute: int = 0

    # Браузерный фронт (Vite и т.п.): список origin через запятую. Пусто — без CORS middleware.
    # «*» — любой origin (без credentials).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    def llm_api_key_resolved(self) -> str:
        a = (self.openai_api_key or "").strip()
        b = (self.openrouter_api_key or "").strip()
        base = (self.openai_base_url or "").strip().lower()
        # При URL OpenRouter не подставлять ключ OpenAI раньше ключа OpenRouter — иначе 401 при смешанном .env.
        if "openrouter" in base:
            return b or a
        return a or b

    def llm_api_key_source_label(self) -> str:
        """Какая переменная окружения дала ключ (для логов)."""
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
            return []
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]


settings = Settings()
