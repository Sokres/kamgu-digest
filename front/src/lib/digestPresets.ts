import type { DigestMode } from '@/types/api'

const STORAGE = 'kamgu_digest_presets'

export interface DigestFormPreset {
  id: string
  name: string
  updatedAt: string
  digestMode: DigestMode
  peerReviewedOnly: boolean
  openalexConceptId: string
  openalexSourceIds: string
  maxCandidates: string
  topN: string
  fromYear: string
  toYear: string
  excludeDois: string
  webScholarlyOnly: boolean
  webExtraTerms: string
  /** Сохранённые флаги расширенного дайджеста (опционально для старых пресетов) */
  fetchOaFulltext?: boolean
  deepDigest?: boolean
  topics: string[]
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadDigestPresets(): DigestFormPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is DigestFormPreset =>
        p &&
        typeof p === 'object' &&
        typeof (p as DigestFormPreset).id === 'string' &&
        typeof (p as DigestFormPreset).name === 'string' &&
        Array.isArray((p as DigestFormPreset).topics),
    )
  } catch {
    return []
  }
}

export function saveDigestPresets(list: DigestFormPreset[]): void {
  localStorage.setItem(STORAGE, JSON.stringify(list))
}

export function upsertDigestPreset(preset: Omit<DigestFormPreset, 'id' | 'updatedAt'> & { id?: string }): DigestFormPreset {
  const list = loadDigestPresets()
  const now = new Date().toISOString()
  const id = preset.id ?? uid()
  const next: DigestFormPreset = {
    ...preset,
    id,
    updatedAt: now,
  }
  const idx = list.findIndex((p) => p.id === id)
  if (idx >= 0) list[idx] = next
  else list.push(next)
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  saveDigestPresets(list)
  return next
}

export function deleteDigestPreset(id: string): void {
  saveDigestPresets(loadDigestPresets().filter((p) => p.id !== id))
}
