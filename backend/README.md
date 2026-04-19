# ИИ-агент дайджестов по направлению исследования

Облачный сервис на **FastAPI**: по запросу ищет открытые публикации в **OpenAlex** (опционально **Semantic Scholar** и **CORE**), после сбора обогащает записи с DOI через **Crossref**, устраняет дубликаты, ранжирует по релевантности к вашим запросам (RU/EN) и формирует **дайджест на русском и английском** через облачную LLM (OpenAI-совместимый API).

## Требования

- Python 3.12+
- Ключ LLM: `OPENAI_API_KEY` (для [OpenRouter](https://openrouter.ai/) — тот же параметр + `OPENAI_BASE_URL=https://openrouter.ai/api/v1`)
- **PostgreSQL** для ежемесячных снимков (`/digests/monthly`): по умолчанию `postgresql://postgres:postgres@127.0.0.1:5432/kamgu_digest`. Поднять локально: `docker compose up -d` в каталоге `backend`. Без Docker задайте `SNAPSHOT_DATABASE_URL=sqlite:///./snapshots.db`.

## Локальный запуск

```bash
cd /path/to/KamGU/backend
docker compose up -d   # PostgreSQL для снимков (опционально, если используете SQLite в .env — пропустите)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# отредактируйте .env — минимум OPENAI_API_KEY

export PYTHONPATH="$(pwd)"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8080
```

- В `.env.example` **Semantic Scholar отключён** (`SEMANTIC_SCHOLAR_ENABLED=false`): кандидаты только из OpenAlex, без 429 от SS. Включите `true`, если нужен второй источник. **CORE** (`CORE_ENABLED`, `CORE_API_KEY` с [core.ac.uk](https://core.ac.uk/api-keys/register)) — третий источник по открытому доступу; между запросами к CORE соблюдается пауза (`CORE_REQUEST_DELAY_SECONDS`). **Crossref** включён по умолчанию (`CROSSREF_ENRICHMENT_ENABLED`) — до `CROSSREF_MAX_UNIQUE_DOIS` уникальных DOI за запрос.
- Проверка: `curl -s http://localhost:8080/health` (liveness). Готовность БД снимков: `curl -s http://localhost:8080/health/ready`
- Тесты: `PYTHONPATH=. pytest tests/`
- Браузерный фронт (Vite на порту 5173): по умолчанию включён **CORS** для `http://localhost:5173` и `http://127.0.0.1:5173`. Задайте `CORS_ORIGINS` (через запятую) или оставьте пустым, чтобы отключить middleware. Готовый UI: каталог [`../front`](../front/README.md) (`npm run dev` в `front` после запуска API).
- Пример запроса:

```bash
curl -s http://localhost:8080/digests \
  -H "Content-Type: application/json" \
  -d '{
    "topic_queries": ["quantum error correction", "квантовые коды"],
    "max_candidates": 60,
    "top_n_for_llm": 12,
    "from_year": 2020,
    "exclude_dois": []
  }'
```

### Режимы `POST /digests`

- **`digest_mode`: `peer_reviewed` (по умолчанию)** — индексы OpenAlex (+ Semantic Scholar при `SEMANTIC_SCHOLAR_ENABLED`, + CORE при `CORE_ENABLED` и ключе). Поля **`peer_reviewed_only`** (по умолчанию `true`) добавляют в OpenAlex фильтр `type:article`. Опционально **`openalex_concept_id`** (`C…` или URL) и **`openalex_source_ids`** (несколько журналов через запятую). Годы и концепт можно комбинировать с серверным **`filter`** (см. код `sources/openalex.py`).
- **`digest_mode`: `web_snippets`** — короткие выдержки из **Tavily** + отдельный LLM-промпт и дисклеймер. В `.env`: **`TAVILY_API_KEY=tvly-...`**; лимит сниппетов: `min(top_n_for_llm, WEB_SEARCH_MAX_RESULTS, 20)`.
  - По умолчанию **`web_scholarly_sources_only: true`**: в Tavily передаётся **`include_domains`** — поиск только по списку научных доменов (PubMed, arXiv, Nature, Springer, …), см. `DEFAULT_SCHOLARLY_DOMAINS` в [`sources/tavily.py`](sources/tavily.py). Переопределение: **`TAVILY_INCLUDE_DOMAINS`** в `.env` (домены через запятую). Чтобы искать по всему интернету — в теле запроса **`web_scholarly_sources_only: false`**.
  - Дополнительные ключевые слова к строке поиска: **`web_search_additional_terms`**. Опционально **`TAVILY_QUERY_PREFIX`** в `.env` (например смещение к «peer-reviewed»).

В ответе **`meta.digest_mode`**, для веб-режима — **`meta.web_snippets_used`**, **`meta.web_scholarly_domain_filter`** (применён ли фильтр доменов). У записей из OpenAlex при наличии данных заполняются **`is_open_access`** и **`oa_url`**.

Ответ: `publications_used`, `article_cards`, `digest_ru`, `digest_en`, поле `meta` (счётчики, время, опционально `warnings` при сбое HTTP к источнику).

### Сохранённые дайджесты (`GET/POST/DELETE /saved-digests`)

Полный ответ разового `POST /digests` можно **сохранить в базу** (та же `SNAPSHOT_DATABASE_URL`, что и для снимков трендов): таблица `saved_digests`, изоляция по `user_id` (JWT при `AUTH_ENABLED` или `AUTH_LEGACY_USER_ID` без авторизации).

- `POST /saved-digests` — тело: `title`, `digest_response` (как в ответе `/digests`), опционально `request_snapshot` (параметры запроса для справки). Лимит размера: `SAVED_DIGEST_MAX_PAYLOAD_BYTES` (по умолчанию 4 МБ).
- `GET /saved-digests` — список метаданных; `GET /saved-digests/{id}` — полная запись; `DELETE /saved-digests/{id}` — удаление своей записи.

Во фронте KamGU: раздел **«Сохранённые»** и кнопка «Сохранить в архив» на странице дайджеста после успешного ответа.

### Периодический дайджест с трендами (`POST /digests/periodic`, алиас `POST /digests/monthly`)

Сохраняет **снимок** топ-статей по профилю в **PostgreSQL** (или **SQLite**, если задан `sqlite:///...` в `SNAPSHOT_DATABASE_URL`), сравнивает с предыдущим сохранённым периодом и возвращает `structured_delta` (прирост цитирований, вошли/вышли из топ-K, сдвиги долей OpenAlex-concepts) плюс текст от LLM с дисклеймером. Имя пути **`/digests/monthly`** оставлено для совместимости; канонический путь — **`/digests/periodic`**. Частоту можно задать **внешним** cron или **встроенным** планировщиком: `DIGEST_PERIODIC_SCHEDULER_ENABLED=true` и CRUD **`/digests/schedules`** (один процесс uvicorn, см. `.env.example`).

- Первый запуск по `profile_id` даёт «базовую линию» без сравнения.
- **Популярность** здесь = изменение `cited_by_count` и ранга внутри вашей выборки, не абсолютный мировой рейтинг.
- Если задан `MONTHLY_DIGEST_CRON_SECRET`, к запросу и к **`/digests/schedules`** нужен заголовок `X-Internal-Key` с тем же значением.

Пример:

```bash
curl -s http://localhost:8080/digests/periodic \
  -H "Content-Type: application/json" \
  -H "X-Internal-Key: your-secret-if-set" \
  -d '{
    "profile_id": "energy",
    "topic_queries": ["renewable energy grid", "энергетика ВИЭ"],
    "max_candidates": 60,
    "top_n_for_llm": 12,
    "trend_top_k": 15,
    "from_year": 2020
  }'
```

**Расписание:** либо внешний планировщик (например [Cloud Scheduler](https://cloud.google.com/scheduler) → HTTP `POST` на ваш сервис, или `cron` на Fly.io) с тем же телом запроса и заголовком секрета, либо записи в **`/digests/schedules`** при включённом **`DIGEST_PERIODIC_SCHEDULER_ENABLED`**. В проде задайте `SNAPSHOT_DATABASE_URL` на управляемый PostgreSQL (или при необходимости `sqlite:////data/snapshots.db` на постоянном томе).

### Дашборд трендов (`GET /trends/...`)

Те же данные, что пишутся в **`digest_snapshots`**, плюс опциональная таблица **`trend_profile_labels`** (человекочитаемые имена). Схема создаётся при первом запросе к трендам или при сохранении снимка.

- **`GET /trends/profiles`** — все `profile_id` с числом снимков, последним периодом и размером топа в последнем снимке.
- **`GET /trends/profiles/{profile_id}/series`** — помесячно: число работ в топе (`works` в payload), дельта и % к предыдущему сохранённому периоду.
- **`PUT /trends/profiles/{profile_id}/label`** — подпись и заметка для UI; при **`MONTHLY_DIGEST_CRON_SECRET`** нужен заголовок **`X-Internal-Key`** (как у ежемесячного дайджеста).

Во фронте KamGU: страница **«Тренды»** (`/trends`).

В Swagger не оставляйте **`from_year` / `to_year` равными 0** — это не «любой год»: так отсекаются почти все статьи. Удалите поля или укажите реальные годы; значения `≤ 0` на сервере приводятся к «не задано».

### OpenRouter (дешёвый тест)

В `.env` (см. `.env.example`):

- `OPENAI_BASE_URL=https://openrouter.ai/api/v1`
- `OPENAI_API_KEY` — ключ с [openrouter.ai/keys](https://openrouter.ai/keys)
- **`OPENAI_MODEL=openai/gpt-4o-mini`** (в `.env.example`) — стабильный вариант на OpenRouter при пополненном балансе.
- **`:free` модели** (например `meta-llama/...:free`) часто дают **429 upstream** у провайдера Venice — ретраи помогают не всегда; смените модель или повторите позже.
- **`OPENAI_RESPONSE_FORMAT_JSON=true`** для `gpt-4o-mini`; для `:free` обычно **`false`** (нет `json_object`), парсинг по тексту.
- Опционально: `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_TITLE` — как в [документации OpenRouter](https://openrouter.ai/docs/quickstart).

## Docker

Образ API (без БД внутри образа — подключайте внешний PostgreSQL через `SNAPSHOT_DATABASE_URL`):

```bash
docker build -t digest-agent .
docker run --rm -e OPENAI_API_KEY -e SNAPSHOT_DATABASE_URL -e PORT=8080 -p 8080:8080 digest-agent
```

Локально **только PostgreSQL** для разработки: `docker compose up -d` в этом каталоге (сервис `postgres`, порт 5432, БД `kamgu_digest`).

Переменная **`PORT`** подставляется в команду запуска (удобно для **Cloud Run** и **Fly.io**).

## Деплой в облако

### Google Cloud Run

1. Соберите образ и загрузите в Artifact Registry (или используйте Cloud Build).
2. Создайте сервис с минимум 1 vCPU, 512Mi RAM; таймаут **300–900 s**, если дайджесты тяжёлые.
3. Секреты: **Secret Manager** → смонтировать `OPENAI_API_KEY` как env.
4. Установите `OPENALEX_MAILTO` на корпоративную почту (рекомендация OpenAlex).

Пример (после настройки `gcloud` и реестра):

```bash
gcloud run deploy digest-agent \
  --image REGION-docker.pkg.dev/PROJECT/REPO/digest-agent:latest \
  --region europe-west1 \
  --set-secrets OPENAI_API_KEY=openai-key:latest \
  --set-env-vars OPENAI_MODEL=gpt-4o-mini \
  --memory 1Gi --timeout 900 --allow-unauthenticated
```

При необходимости ограничьте доступ (IAM / IAP) вместо публичного API.

### Fly.io

1. `fly launch` в каталоге с `Dockerfile` (при необходимости добавьте `fly.toml`).
2. Секреты: `fly secrets set OPENAI_API_KEY=sk-...`
3. В `fly.toml` задайте `http_service.internal_port = 8080` и при необходимости увеличьте `http_service.idle_timeout` для длинных запросов.

### Лимиты и стоимость

- **Semantic Scholar** — умеренные лимиты на бесплатный API. Сервис делает **ретраи с backoff**, **последовательные** запросы к источникам и паузу `SOURCE_STAGGER_SECONDS`. При частых 429 увеличьте паузу или подождите минуту.
- **OpenAlex** — укажите `OPENALEX_MAILTO` в `User-Agent`.
- **LLM** — основная стоимость; уменьшайте `top_n_for_llm` и длину abstract в коде при необходимости.

## Переменные окружения

| Переменная | Назначение |
|------------|------------|
| `OPENAI_API_KEY` | Ключ API (обязательно для `/digests`; для OpenRouter — их ключ) |
| `OPENAI_BASE_URL` | Например `https://openrouter.ai/api/v1` или OpenAI/Azure |
| `OPENAI_MODEL` | ID модели у провайдера (по умолчанию в коде `gpt-4o-mini`) |
| `OPENAI_RESPONSE_FORMAT_JSON` | `true`/`false` — `json_object` у OpenAI; у OpenRouter `:free` обычно `false` |
| `OPENROUTER_HTTP_REFERER` | Опционально, URL приложения для OpenRouter |
| `OPENROUTER_APP_TITLE` | Опционально, название для OpenRouter (по умолчанию KamGU Research Digest) |
| `LLM_MAX_RETRIES` | Число попыток при 429 у LLM (по умолчанию 8) |
| `LLM_RETRY_BASE_SECONDS` | База экспоненциальной паузы между попытками (по умолчанию 4) |
| `OPENALEX_MAILTO` | Email в User-Agent для OpenAlex и общего HTTP-клиента |
| `HTTP_USER_AGENT` | Явный User-Agent (если не задан — из `OPENALEX_MAILTO` или дефолт; помогает при **403** у SS) |
| `HTTP_TIMEOUT_SECONDS` | Таймаут HTTP к источникам |
| `HTTP_MAX_RETRIES` | Повторы при 429/5xx и сетевых сбоях (по умолчанию 5) |
| `SOURCE_STAGGER_SECONDS` | Пауза между OpenAlex и Semantic Scholar (по умолчанию 1.5) |
| `SEMANTIC_SCHOLAR_PAGE_DELAY_SECONDS` | Пауза перед 2-й и далее страницей SS (по умолчанию 5) |
| `SEMANTIC_SCHOLAR_API_KEY` | Ключ [Semantic Scholar API](https://www.semanticscholar.org/product/api) — выше лимиты |
| `SEMANTIC_SCHOLAR_ENABLED` | `true`/`false` — по умолчанию `false`; при `true` добавляется Semantic Scholar (половина `max_candidates`) |
| `SEMANTIC_SCHOLAR_MAX_RETRIES` | Ретраи для SS при 429 (по умолчанию 12; паузы между ними длинные) |
| `LOG_LEVEL` | `INFO`, `DEBUG`, … |
| `CORS_ORIGINS` | Origins для браузера (через запятую). Пусто — без CORS. `*` — любой origin (без credentials). По умолчанию в коде — localhost:5173 |
| `SNAPSHOT_DATABASE_URL` | Снимки: `postgresql://user:pass@host:5432/dbname` (по умолчанию локальный Postgres из `docker compose`) или `sqlite:///./snapshots.db` без Docker |
| `MONTHLY_DIGEST_CRON_SECRET` | Если не пусто — обязателен заголовок `X-Internal-Key` для `/digests/periodic` и `/digests/monthly` |
| `DIGEST_RATE_LIMIT_PER_MINUTE` | Лимит запросов к `POST /digests` с одного IP (скользящая минута, `0` = выкл.) |

## Структура проекта

- `digest/` — настройки, модели, [`digest/snapshot_store.py`](digest/snapshot_store.py) (снимки в PostgreSQL или SQLite)
- `app/` — HTTP-слой FastAPI: [`app/main.py`](app/main.py) (приложение, CORS), [`app/api/router.py`](app/api/router.py) (сборка роутов), [`app/api/routes/`](app/api/routes/) (эндпоинты), [`app/api/deps.py`](app/api/deps.py) (зависимости, например секрет для `/digests/monthly`), [`app/services/digest_http.py`](app/services/digest_http.py) (вызов пайплайна и маппинг ошибок в HTTP)
- `sources/` — OpenAlex, Semantic Scholar
- `pipeline/` — дедупликация, скоринг, вызов LLM, [`pipeline/run_monthly.py`](pipeline/run_monthly.py), [`pipeline/monthly_diff.py`](pipeline/monthly_diff.py)
- `docs/PHASE2.md` — очередь и расписание (следующая фаза)

## OpenAPI

После запуска: `/docs` (Swagger UI).
