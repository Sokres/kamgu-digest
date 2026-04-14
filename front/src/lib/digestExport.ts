import type { DigestResponse, MonthlyDigestResponse, PublicationInput } from '@/types/api'

function escapeMd(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

function publicationLine(p: PublicationInput, i: number): string {
  const parts: string[] = []
  parts.push(`${i + 1}. **${escapeMd(p.title)}**`)
  if (p.year != null) parts.push(`(${p.year})`)
  if (p.doi) parts.push(`— DOI: \`${p.doi}\``)
  if (p.url) parts.push(`— [ссылка](${p.url})`)
  if (p.source) parts.push(`— источник: ${p.source}`)
  return parts.join(' ')
}

export function publicationsToMarkdown(rows: PublicationInput[]): string {
  if (!rows.length) return '_Публикаций нет._\n'
  return rows.map((p, i) => publicationLine(p, i)).join('\n\n') + '\n'
}

export function digestBodyToMarkdown(data: DigestResponse | MonthlyDigestResponse): string {
  const blocks: string[] = []
  blocks.push('## Дайджест (RU)\n')
  blocks.push(escapeMd(data.digest_ru || '—'))
  blocks.push('\n\n## Дайджест (EN)\n')
  blocks.push(escapeMd(data.digest_en || '—'))
  blocks.push('\n\n## Использованные публикации\n\n')
  blocks.push(publicationsToMarkdown(data.publications_used))
  return blocks.join('')
}

export function fullReportMarkdown(
  data: DigestResponse | MonthlyDigestResponse,
  title = 'Дайджест литературы',
): string {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  const meta = data.meta
  if (meta) {
    lines.push('## Мета')
    lines.push('')
    const mode = meta.digest_mode ?? 'peer_reviewed'
    lines.push(`- Режим: ${mode === 'web_snippets' ? 'веб-сниппеты' : 'рецензируемый корпус'}`)
    if (mode !== 'web_snippets') {
      lines.push(`- OpenAlex (кандидаты): ${meta.candidates_openalex ?? '—'}`)
      lines.push(`- Semantic Scholar: ${meta.candidates_semantic_scholar ?? '—'}`)
      lines.push(`- CORE: ${meta.candidates_core ?? '—'}`)
      lines.push(`- Crossref (уникальных DOI обогащено): ${meta.crossref_enriched_dois ?? '—'}`)
      lines.push(`- После дедупликации: ${meta.after_dedupe ?? '—'}`)
    } else {
      lines.push(`- Сниппетов в LLM: ${meta.web_snippets_used ?? '—'}`)
    }
    lines.push(`- В LLM: ${meta.used_for_llm ?? '—'}`)
    if (meta.elapsed_seconds != null) lines.push(`- Секунд: ${meta.elapsed_seconds.toFixed(1)}`)
    if ('profile_id' in meta && meta.profile_id) lines.push(`- profile_id: ${meta.profile_id}`)
    if ('period' in meta && meta.period) lines.push(`- Период: ${meta.period}`)
    if ('compared_period' in meta && meta.compared_period) {
      lines.push(`- Сравнение с: ${meta.compared_period}`)
    }
    lines.push('')
  }
  lines.push(digestBodyToMarkdown(data))
  if ('structured_delta' in data && data.structured_delta) {
    const d = data.structured_delta
    lines.push('\n## Структурированное сравнение периодов\n')
    lines.push(`- Текущий период: ${d.current_period}`)
    if (d.compared_period) lines.push(`- Сравнение с: ${d.compared_period}`)
    if (d.is_baseline) lines.push('- Базовая линия (первый снимок)')
    lines.push('')
  }
  return lines.join('\n')
}

export function downloadBlob(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  ta.remove()
}
