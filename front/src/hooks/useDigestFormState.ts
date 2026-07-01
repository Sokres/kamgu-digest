import { useMemo, useState } from 'react'

import type { DigestFormPreset } from '@/lib/digestPresets'
import {
  parseDois,
  parseSourceIds,
  parseWebExtraTerms,
  parseYear,
  topicQueriesFromLines,
  validateSharedLimits,
  validateTrendTopK,
} from '@/lib/digestFormParse'
import type { DigestMode, DigestRequest, MonthlyDigestRequest, SnapshotPeriodMode } from '@/types/api'

export function useDigestFormState() {
  const [topics, setTopics] = useState<string[]>([''])
  const [digestMode, setDigestMode] = useState<DigestMode>('peer_reviewed')
  const [peerReviewedOnly, setPeerReviewedOnly] = useState(true)
  const [openalexConceptId, setOpenalexConceptId] = useState('')
  const [openalexSourceIds, setOpenalexSourceIds] = useState('')
  const [maxCandidates, setMaxCandidates] = useState('100')
  const [topN, setTopN] = useState('20')
  const [trendTopK, setTrendTopK] = useState('20')
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [excludeDois, setExcludeDois] = useState('')
  const [webScholarlyOnly, setWebScholarlyOnly] = useState(true)
  const [webExtraTerms, setWebExtraTerms] = useState('')
  const [fetchOaFulltext, setFetchOaFulltext] = useState(false)
  const [deepDigest, setDeepDigest] = useState(false)

  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [forcePeriod, setForcePeriod] = useState('')
  const [periodMode, setPeriodMode] = useState<SnapshotPeriodMode>('day')
  const [internalKeyField, setInternalKeyField] = useState('')

  function addTopic() {
    setTopics((t) => [...t, ''])
  }

  function setTopic(i: number, v: string) {
    setTopics((t) => t.map((x, j) => (j === i ? v : x)))
  }

  function removeTopic(i: number) {
    setTopics((t) => t.filter((_, j) => j !== i))
  }

  const presetSnapshot = useMemo(
    (): Omit<DigestFormPreset, 'id' | 'name' | 'updatedAt'> => ({
      digestMode,
      peerReviewedOnly,
      openalexConceptId,
      openalexSourceIds,
      maxCandidates,
      topN,
      fromYear,
      toYear,
      excludeDois,
      webScholarlyOnly,
      webExtraTerms,
      fetchOaFulltext,
      deepDigest,
      topics: [...topics],
    }),
    [
      digestMode,
      peerReviewedOnly,
      openalexConceptId,
      openalexSourceIds,
      maxCandidates,
      topN,
      fromYear,
      toYear,
      excludeDois,
      webScholarlyOnly,
      webExtraTerms,
      fetchOaFulltext,
      deepDigest,
      topics,
    ],
  )

  function applyPreset(p: DigestFormPreset) {
    setDigestMode(p.digestMode)
    setPeerReviewedOnly(p.peerReviewedOnly)
    setOpenalexConceptId(p.openalexConceptId)
    setOpenalexSourceIds(p.openalexSourceIds)
    setMaxCandidates(p.maxCandidates)
    setTopN(p.topN)
    setFromYear(p.fromYear)
    setToYear(p.toYear)
    setExcludeDois(p.excludeDois)
    setWebScholarlyOnly(p.webScholarlyOnly)
    setWebExtraTerms(p.webExtraTerms)
    setFetchOaFulltext(p.fetchOaFulltext ?? false)
    setDeepDigest(p.deepDigest ?? false)
    setTopics(p.topics.length ? [...p.topics] : [''])
  }

  function buildMonthlyRequest(
    profileId: string,
  ): { ok: true; body: MonthlyDigestRequest } | { ok: false; message: string } {
    const queries = topicQueriesFromLines(topics)
    if (!queries.length) {
      return { ok: false, message: 'Добавьте хотя бы одну поисковую строку в общих параметрах.' }
    }
    const pid = profileId.trim()
    if (!pid) {
      return { ok: false, message: 'Выберите направление или создайте новое.' }
    }
    const limits = validateSharedLimits(maxCandidates, topN)
    if (!limits.ok) return limits
    const tk = validateTrendTopK(trendTopK)
    if (!tk.ok) return tk

    const fp = forcePeriod.trim()
    const body: MonthlyDigestRequest = {
      profile_id: pid,
      topic_queries: queries,
      digest_mode: digestMode,
      max_candidates: limits.maxCandidates,
      top_n_for_llm: limits.topN,
      trend_top_k: tk.value,
      from_year: parseYear(fromYear),
      to_year: parseYear(toYear),
      exclude_dois: parseDois(excludeDois),
      force_period: fp ? fp : null,
      period_mode: periodMode,
      fetch_oa_fulltext: fetchOaFulltext,
      deep_digest: deepDigest,
    }
    if (digestMode === 'web_snippets') {
      body.web_scholarly_sources_only = webScholarlyOnly
      const extras = parseWebExtraTerms(webExtraTerms)
      if (extras.length) body.web_search_additional_terms = extras
    }
    return { ok: true, body }
  }

  function buildDigestRequest(attachedDocumentIds: string[]): { ok: true; body: DigestRequest } | { ok: false; message: string } {
    const queries = topicQueriesFromLines(topics)
    if (!queries.length) {
      return { ok: false, message: 'Добавьте хотя бы одну поисковую строку.' }
    }
    const limits = validateSharedLimits(maxCandidates, topN)
    if (!limits.ok) return limits

    const body: DigestRequest = {
      topic_queries: queries,
      digest_mode: digestMode,
      max_candidates: limits.maxCandidates,
      top_n_for_llm: limits.topN,
      from_year: parseYear(fromYear),
      to_year: parseYear(toYear),
      exclude_dois: parseDois(excludeDois),
    }

    if (digestMode === 'peer_reviewed') {
      body.peer_reviewed_only = peerReviewedOnly
      const cid = openalexConceptId.trim()
      if (cid) body.openalex_concept_id = cid
      const sids = parseSourceIds(openalexSourceIds)
      if (sids.length) body.openalex_source_ids = sids
      if (attachedDocumentIds.length) {
        body.attached_document_ids = attachedDocumentIds
      }
      body.fetch_oa_fulltext = fetchOaFulltext
      body.deep_digest = deepDigest
    }

    if (digestMode === 'web_snippets') {
      body.web_scholarly_sources_only = webScholarlyOnly
      const extras = parseDois(webExtraTerms)
      if (extras.length) body.web_search_additional_terms = extras
    }

    return { ok: true, body }
  }

  return {
    topics,
    setTopics,
    addTopic,
    setTopic,
    removeTopic,
    digestMode,
    setDigestMode,
    peerReviewedOnly,
    setPeerReviewedOnly,
    openalexConceptId,
    setOpenalexConceptId,
    openalexSourceIds,
    setOpenalexSourceIds,
    maxCandidates,
    setMaxCandidates,
    topN,
    setTopN,
    trendTopK,
    setTrendTopK,
    fromYear,
    setFromYear,
    toYear,
    setToYear,
    excludeDois,
    setExcludeDois,
    webScholarlyOnly,
    setWebScholarlyOnly,
    webExtraTerms,
    setWebExtraTerms,
    fetchOaFulltext,
    setFetchOaFulltext,
    deepDigest,
    setDeepDigest,
    selectedProfileId,
    setSelectedProfileId,
    forcePeriod,
    setForcePeriod,
    periodMode,
    setPeriodMode,
    internalKeyField,
    setInternalKeyField,
    presetSnapshot,
    applyPreset,
    buildDigestRequest,
    buildMonthlyRequest,
    topicQueriesFromLines: () => topicQueriesFromLines(topics),
  }
}

export type DigestFormState = ReturnType<typeof useDigestFormState>
