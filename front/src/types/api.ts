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
  web_scholarly_sources_only?: boolean
  web_search_additional_terms?: string[]
  attached_document_ids?: string[]
  fetch_oa_fulltext?: boolean
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
  summary_ru?: string
  summary_en?: string
  bullets?: string[]
  why_relevant?: string
}

export interface DigestMeta {
  digest_mode?: DigestMode
  candidates_openalex?: number
  candidates_semantic_scholar?: number
  candidates_core?: number
  crossref_enriched_dois?: number
  web_snippets_used?: number
  web_scholarly_domain_filter?: boolean
  user_pdf_documents?: number
  oa_fulltext_fetched?: number
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
  public_share_active?: boolean
}

export interface SavedDigestOut {
  id: string
  title: string
  created_at: string
  digest_response: DigestResponse
  monthly_digest?: MonthlyDigestResponse | null
  request_snapshot?: DigestRequest | null
  monthly_request_snapshot?: MonthlyDigestRequest | null
  public_share_active?: boolean
}

export interface SavedDigestCreated {
  id: string
  created_at: string
}

export interface SavedDigestShareResponse {
  token: string
  public_path: string
}

export interface SavedDigestCreateBody {
  title: string
  digest_response?: DigestResponse
  monthly_digest?: MonthlyDigestResponse
  request_snapshot?: DigestRequest | null
  monthly_request_snapshot?: MonthlyDigestRequest | null
}

export interface PdfDocumentUploadResponse {
  id: string
  publication: PublicationInput
  warnings?: string[]
}

export type SnapshotPeriodMode = 'month' | 'day'

export interface MonthlyDigestRequest {
  profile_id: string
  topic_queries: string[]
  digest_mode?: DigestMode
  web_scholarly_sources_only?: boolean
  web_search_additional_terms?: string[]
  max_candidates?: number
  top_n_for_llm?: number
  trend_top_k?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
  force_period?: string | null
  period_mode?: SnapshotPeriodMode
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
  period_mode?: SnapshotPeriodMode
  compared_period?: string | null
  snapshot_saved?: boolean
  snapshot_is_update?: boolean
}

export interface MonthlyDigestResponse {
  publications_used: PublicationInput[]
  article_cards: ArticleCard[]
  digest_ru: string
  digest_en: string
  structured_delta: MonthlyStructuredDelta
  meta?: MonthlyDigestMeta
}

export interface TrendProfileSummary {
  user_id?: string
  profile_id: string
  snapshot_count: number
  last_period?: string | null
  last_created_at?: string | null
  topic_queries: string[]
  work_count_last: number
  display_name?: string | null
  note?: string
}

export interface DigestProfileCreateBody {
  display_name: string
  note?: string
}

export interface DigestProfileCreated {
  profile_id: string
  display_name: string
  note: string
  created_at: string
}

export interface TrendSnapshotDetail {
  profile_id: string
  period: string
  created_at: string
  topic_queries: string[]
  work_count: number
  digest_available: boolean
  digest_ru: string
  digest_en: string
  publications_used: PublicationInput[]
  article_cards: ArticleCard[]
  structured_delta?: MonthlyStructuredDelta | null
  meta?: MonthlyDigestMeta | null
  works: SnapshotWorkRecord[]
}

export interface SnapshotWorkRecord {
  dedupe_key: string
  title: string
  year?: number | null
  doi?: string | null
  openalex_work_id?: string | null
  citation_count?: number | null
  rank: number
  concepts?: ConceptRef[]
}

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

export interface TrendCitationGainHighlight {
  title: string
  delta: number
}

export interface TrendConceptShiftHighlight {
  name: string
  delta: number
}

export interface TrendPeriodHighlight {
  period: string
  created_at: string
  work_count: number
  is_baseline?: boolean
  compared_period?: string | null
  entered_count?: number
  left_count?: number
  top_citation_gain?: TrendCitationGainHighlight | null
  top_concept_shift?: TrendConceptShiftHighlight | null
}

export interface TrendConceptEvolutionPoint {
  period: string
  shares: Record<string, number>
}

export interface TrendLatestSnapshotSummary {
  period: string
  created_at: string
  digest_available?: boolean
  digest_ru?: string
  digest_en?: string
  structured_delta?: MonthlyStructuredDelta | null
}

export interface TrendHighlightsResponse {
  profile_id: string
  topic_queries: string[]
  points: TrendPeriodHighlight[]
  latest_snapshot?: TrendLatestSnapshotSummary | null
  concept_evolution: TrendConceptEvolutionPoint[]
}

export interface TrendAnalysisResponse {
  profile_id: string
  analyzed_through_period?: string | null
  analysis_ru: string
  analysis_en: string
  overview_ru: string
  overview_en: string
  cached: boolean
  snapshot_count: number
}

export interface TrendProfileLabelUpdate {
  display_name: string
  note?: string
}

export interface PeriodicDigestScheduleOut {
  id: string
  user_id?: string
  profile_id: string
  cron_utc: string
  enabled: boolean
  topic_queries: string[]
  digest_mode?: DigestMode
  web_scholarly_sources_only?: boolean
  web_search_additional_terms?: string[]
  fetch_oa_fulltext?: boolean
  deep_digest?: boolean
  max_candidates: number
  top_n_for_llm: number
  trend_top_k: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois: string[]
  period_mode?: SnapshotPeriodMode
  created_at: string
  updated_at: string
  last_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
}

export interface DigestScheduleRunOut {
  id: string
  schedule_id: string
  user_id: string
  finished_at: string
  status: string
  message?: string | null
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
  digest_mode?: DigestMode
  web_scholarly_sources_only?: boolean
  web_search_additional_terms?: string[]
  fetch_oa_fulltext?: boolean
  deep_digest?: boolean
  max_candidates?: number
  top_n_for_llm?: number
  trend_top_k?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
  period_mode?: SnapshotPeriodMode
}

export interface PeriodicDigestScheduleUpdate {
  cron_utc?: string
  enabled?: boolean
  topic_queries?: string[]
  digest_mode?: DigestMode
  web_scholarly_sources_only?: boolean
  web_search_additional_terms?: string[]
  fetch_oa_fulltext?: boolean
  deep_digest?: boolean
  max_candidates?: number
  top_n_for_llm?: number
  trend_top_k?: number
  from_year?: number | null
  to_year?: number | null
  exclude_dois?: string[]
  period_mode?: SnapshotPeriodMode
}

export interface AuthStatusResponse {
  auth_enabled: boolean
  registration_enabled: boolean
}

export interface AuthTokenResponse {
  access_token: string
  token_type: string
  refresh_token: string
  user_id: string
  username: string
}

export interface AuthMeResponse {
  user_id: string
  username: string
}
