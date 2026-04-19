/** Mirrors backend/digest/models.py */

export type DigestMode = 'peer_reviewed' | 'web_snippets'

export interface ConceptRef {
  id?: string
  display_name?: string
  score?: number
}

export interface DigestRequest {
  topic_queries: string[]
  digest_mode?: DigestMode
  max_candidates?: number
  top_n_for_llm?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
  peer_reviewed_only?: boolean
  openalex_concept_id?: string | null
  openalex_source_ids?: string[]
  /** Только для web_snippets: ограничить Tavily научными доменами (по умолчанию true) */
  web_scholarly_sources_only?: boolean
  /** Доп. ключевые слова к запросу Tavily */
  web_search_additional_terms?: string[]
  /** Id из POST /documents/pdf; учитываются в peer_reviewed */
  attached_document_ids?: string[]
  /** Скачать OA PDF по DOI (Unpaywall), извлечь текст для LLM; нужен email на сервере */
  fetch_oa_fulltext?: boolean
  /** Принудительно двухэтапный LLM (карта по статьям + сводка) */
  deep_digest?: boolean
}

export interface PublicationInput {
  title: string
  abstract?: string
  year?: number | null
  url?: string
  doi?: string | null
  source?: string
  citation_count?: number | null
  openalex_work_id?: string | null
  concepts?: ConceptRef[]
  is_open_access?: boolean | null
  oa_url?: string | null
}

export interface ArticleCard {
  title: string
  url?: string
  year?: number | null
  bullets?: string[]
  why_relevant?: string
}

export interface DigestMeta {
  digest_mode?: DigestMode
  candidates_openalex?: number
  candidates_semantic_scholar?: number
  candidates_core?: number
  /** Уникальных DOI, обогащённых через Crossref */
  crossref_enriched_dois?: number
  web_snippets_used?: number
  /** Применён ли фильтр include_domains (научные сайты) */
  web_scholarly_domain_filter?: boolean
  /** Загруженных PDF в кандидатах (peer_reviewed) */
  user_pdf_documents?: number
  /** Работ с расширенным текстом из OA PDF */
  oa_fulltext_fetched?: number
  /** Использован двухэтапный LLM */
  two_stage_llm?: boolean
  after_dedupe?: number
  used_for_llm?: number
  elapsed_seconds?: number
  warnings?: string[]
}

export interface DigestResponse {
  publications_used: PublicationInput[]
  article_cards: ArticleCard[]
  digest_ru: string
  digest_en: string
  meta?: DigestMeta
}

export interface SavedDigestListItem {
  id: string
  title: string
  created_at: string
  digest_mode?: DigestMode
  used_for_llm?: number | null
  elapsed_seconds?: number | null
}

export interface SavedDigestOut {
  id: string
  title: string
  created_at: string
  digest_response: DigestResponse
  request_snapshot?: DigestRequest | null
}

export interface SavedDigestCreated {
  id: string
  created_at: string
}

export interface SavedDigestCreateBody {
  title: string
  digest_response: DigestResponse
  request_snapshot?: DigestRequest | null
}

export interface PdfDocumentUploadResponse {
  id: string
  publication: PublicationInput
  warnings?: string[]
}

export interface MonthlyDigestRequest {
  profile_id: string
  topic_queries: string[]
  max_candidates?: number
  top_n_for_llm?: number
  trend_top_k?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
  force_period?: string | null
  fetch_oa_fulltext?: boolean
  deep_digest?: boolean
}

export interface WorkCitationDelta {
  dedupe_key: string
  title: string
  citation_previous?: number | null
  citation_current?: number | null
  citation_delta?: number | null
  rank_previous?: number | null
  rank_current?: number | null
}

export interface ConceptShareDelta {
  concept_name: string
  share_previous?: number | null
  share_current?: number | null
  delta?: number | null
}

export interface MonthlyStructuredDelta {
  profile_id: string
  current_period: string
  compared_period?: string | null
  is_baseline?: boolean
  top_by_citation_gain?: WorkCitationDelta[]
  entered_top_k?: WorkCitationDelta[]
  left_top_k?: WorkCitationDelta[]
  concept_share_deltas?: ConceptShareDelta[]
}

export interface MonthlyDigestMeta extends DigestMeta {
  profile_id?: string
  period?: string
  compared_period?: string | null
  snapshot_saved?: boolean
}

export interface MonthlyDigestResponse {
  publications_used: PublicationInput[]
  article_cards: ArticleCard[]
  digest_ru: string
  digest_en: string
  structured_delta: MonthlyStructuredDelta
  meta?: MonthlyDigestMeta
}

/** GET /trends/profiles */
export interface TrendProfileSummary {
  user_id?: string
  profile_id: string
  snapshot_count: number
  last_period: string
  last_created_at: string
  topic_queries: string[]
  work_count_last: number
  display_name?: string | null
  note?: string
}

/** GET /trends/profiles/:id/series */
export interface TrendSeriesPoint {
  period: string
  created_at: string
  work_count: number
  topic_queries: string[]
  delta_vs_prev?: number | null
  pct_change_vs_prev?: number | null
}

export interface TrendSeriesResponse {
  profile_id: string
  points: TrendSeriesPoint[]
}

/** PUT /trends/profiles/:id/label */
export interface TrendProfileLabelUpdate {
  display_name: string
  note?: string
}

/** GET/POST/PATCH/DELETE /digests/schedules */
export interface PeriodicDigestScheduleOut {
  id: string
  user_id?: string
  profile_id: string
  cron_utc: string
  enabled: boolean
  topic_queries: string[]
  max_candidates: number
  top_n_for_llm: number
  trend_top_k: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois: string[]
  created_at: string
  updated_at: string
  last_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
}

export interface DigestSchedulesListResponse {
  items: PeriodicDigestScheduleOut[]
  scheduler_enabled_in_config: boolean
  scheduler_running: boolean
}

export interface PeriodicDigestScheduleCreate {
  profile_id: string
  cron_utc: string
  enabled?: boolean
  topic_queries: string[]
  max_candidates?: number
  top_n_for_llm?: number
  trend_top_k?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
}

export interface PeriodicDigestScheduleUpdate {
  cron_utc?: string
  enabled?: boolean
  topic_queries?: string[]
  max_candidates?: number
  top_n_for_llm?: number
  trend_top_k?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
}

export interface AuthStatusResponse {
  auth_enabled: boolean
  registration_enabled: boolean
}

export interface AuthTokenResponse {
  access_token: string
  token_type: string
  user_id: string
  username: string
}
