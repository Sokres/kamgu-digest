import type { TrendProfileSummary } from '@/types/api'

export function profileDisplayName(p: TrendProfileSummary): string {
  const d = (p.display_name ?? '').trim()
  return d || p.profile_id
}

export function profileHasDisplayName(p: TrendProfileSummary): boolean {
  return (p.display_name ?? '').trim().length > 0
}
