import type { DigestFormState } from '@/hooks/useDigestFormState'
import type { ScheduleFormFieldsState } from '@/hooks/useScheduleForm'
import {
  parseDois,
  parseWebExtraTerms,
  parseYear,
  validateSharedLimits,
  validateTrendTopK,
} from '@/lib/digestFormParse'
import { inferPeriodModeFromCron } from '@/lib/periodMode'
import type { PeriodicDigestScheduleCreate, PeriodicDigestScheduleUpdate, SnapshotPeriodMode } from '@/types/api'

type ScheduleParamsOk = {
  ok: true
  topic_queries: string[]
  cron_utc: string
  digest_mode: PeriodicDigestScheduleCreate['digest_mode']
  web_scholarly_sources_only?: boolean
  web_search_additional_terms?: string[]
  max_candidates: number
  top_n_for_llm: number
  trend_top_k: number
  from_year: number | null
  to_year: number | null
  exclude_dois: string[]
  fetch_oa_fulltext: boolean
  deep_digest: boolean
  period_mode: SnapshotPeriodMode
}

type ScheduleParamsErr = { ok: false; message: string }

export function resolveScheduleParams(
  form: DigestFormState,
  scheduleFields: ScheduleFormFieldsState,
): ScheduleParamsOk | ScheduleParamsErr {
  const queries = scheduleFields.topicText.split(/\n+/).map((s) => s.trim()).filter(Boolean)
  const fromForm = form.topicQueriesFromLines()
  if (!queries.length && !fromForm.length) {
    return { ok: false, message: 'Укажите темы в расписании или в общих параметрах поиска.' }
  }
  const topic_queries = queries.length ? queries : fromForm

  const cron = scheduleFields.cron.trim()
  if (!cron) {
    return { ok: false, message: 'Укажите расписание (cron, UTC).' }
  }

  const limits = validateSharedLimits(form.maxCandidates, form.topN)
  if (!limits.ok) return { ok: false, message: limits.message }

  const tk = validateTrendTopK(form.trendTopK)
  if (!tk.ok) return { ok: false, message: tk.message }

  const extras = parseWebExtraTerms(form.webExtraTerms)

  return {
    ok: true,
    topic_queries,
    cron_utc: cron,
    digest_mode: form.digestMode,
    web_scholarly_sources_only: form.digestMode === 'web_snippets' ? form.webScholarlyOnly : undefined,
    web_search_additional_terms:
      form.digestMode === 'web_snippets' && extras.length ? extras : undefined,
    max_candidates: limits.maxCandidates,
    top_n_for_llm: limits.topN,
    trend_top_k: tk.value,
    from_year: parseYear(form.fromYear),
    to_year: parseYear(form.toYear),
    exclude_dois: parseDois(form.excludeDois),
    fetch_oa_fulltext: form.fetchOaFulltext,
    deep_digest: form.deepDigest,
    period_mode: inferPeriodModeFromCron(cron),
  }
}

export function toScheduleCreateBody(
  profileId: string,
  params: ScheduleParamsOk,
  enabled = true,
): PeriodicDigestScheduleCreate {
  return {
    profile_id: profileId,
    cron_utc: params.cron_utc,
    enabled,
    topic_queries: params.topic_queries,
    digest_mode: params.digest_mode,
    web_scholarly_sources_only: params.web_scholarly_sources_only,
    web_search_additional_terms: params.web_search_additional_terms,
    max_candidates: params.max_candidates,
    top_n_for_llm: params.top_n_for_llm,
    trend_top_k: params.trend_top_k,
    from_year: params.from_year,
    to_year: params.to_year,
    exclude_dois: params.exclude_dois,
    fetch_oa_fulltext: params.fetch_oa_fulltext,
    deep_digest: params.deep_digest,
    period_mode: params.period_mode,
  }
}

export function toSchedulePatchBody(
  params: ScheduleParamsOk,
  enabled: boolean,
): PeriodicDigestScheduleUpdate {
  return {
    cron_utc: params.cron_utc,
    enabled,
    topic_queries: params.topic_queries,
    digest_mode: params.digest_mode,
    web_scholarly_sources_only: params.web_scholarly_sources_only,
    web_search_additional_terms: params.web_search_additional_terms,
    max_candidates: params.max_candidates,
    top_n_for_llm: params.top_n_for_llm,
    trend_top_k: params.trend_top_k,
    from_year: params.from_year,
    to_year: params.to_year,
    exclude_dois: params.exclude_dois,
    fetch_oa_fulltext: params.fetch_oa_fulltext,
    deep_digest: params.deep_digest,
    period_mode: params.period_mode,
  }
}
