export function parseYear(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function parseDois(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseSourceIds(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseWebExtraTerms(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function topicQueriesFromLines(topics: string[]): string[] {
  return topics.map((s) => s.trim()).filter(Boolean)
}

export type SharedLimitsValidation =
  | { ok: true; maxCandidates: number; topN: number }
  | { ok: false; message: string }

export function validateSharedLimits(
  maxCandidates: string,
  topN: string,
): SharedLimitsValidation {
  const mc = Number.parseInt(maxCandidates, 10)
  const tn = Number.parseInt(topN, 10)
  if (!Number.isFinite(mc) || mc < 10 || mc > 200) {
    return { ok: false, message: 'max_candidates: число от 10 до 200' }
  }
  if (!Number.isFinite(tn) || tn < 3 || tn > 40) {
    return { ok: false, message: 'top_n_for_llm: число от 3 до 40' }
  }
  return { ok: true, maxCandidates: mc, topN: tn }
}

export function validateTrendTopK(trendTopK: string): { ok: true; value: number } | { ok: false; message: string } {
  const tk = Number.parseInt(trendTopK, 10)
  if (!Number.isFinite(tk) || tk < 5 || tk > 60) {
    return { ok: false, message: 'trend_top_k: число от 5 до 60' }
  }
  return { ok: true, value: tk }
}
