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
  web_snippets_used?: number
  /** Применён ли фильтр include_domains (научные сайты) */
  web_scholarly_domain_filter?: boolean
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
