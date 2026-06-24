import type { ArticleCard, DigestResponse, MonthlyDigestResponse, PublicationInput } from '@/types/api'

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

function articleCardsToMarkdown(cards: ArticleCard[]): string {
  if (!cards.length) return '_Карточек нет._\n'
  const blocks: string[] = []
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    const summary = (c.summary_ru || c.summary_en || '').trim()
    const head = `### ${i + 1}. ${escapeMd(c.title)}`
    blocks.push(head)
    if (c.year != null) blocks.push(`**Год:** ${c.year}`)
    if (c.url) blocks.push(`**Ссылка:** ${c.url}`)
    if (summary) blocks.push(`\n${escapeMd(summary)}`)
    if (c.why_relevant) blocks.push(`\n**Релевантность:** ${escapeMd(c.why_relevant)}`)
    if (c.bullets?.length) {
      blocks.push('')
      for (const b of c.bullets) {
        blocks.push(`- ${escapeMd(b)}`)
      }
    }
    blocks.push('')
  }
  return blocks.join('\n')
}

function bibtexBraceEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
}

function risLine(tag: string, value: string): string {
  const t = value.replace(/\r?\n/g, ' ').trim()
  if (!t) return ''
  const prefix = `${tag}  - `
  const max = 2000
  const chunk = t.length > max ? `${t.slice(0, max)}…` : t
  return `${prefix}${chunk}`
}

function citeKeyBase(p: PublicationInput, i: number): string {
  const y = p.year != null ? String(Math.trunc(p.year)) : 'nd'
  const slug = p.title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join('')
    .toLowerCase()
    .slice(0, 28)
  const base = (slug || 'item') + y + i
  return base.replace(/[^a-z0-9_]/gi, '_')
}

export function publicationsToBibtex(rows: PublicationInput[]): string {
  if (!rows.length) return ''
  const blocks: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i]
    const key = citeKeyBase(p, i)
    const title = bibtexBraceEscape(p.title || 'Untitled')
    const doi = (p.doi || '').trim()
    const url = (p.url || '').trim()
    const year = p.year != null ? String(Math.trunc(p.year)) : ''
    const journal = bibtexBraceEscape((p.source || '').trim())
    if (doi) {
      const lines = [
        `@article{${key},`,
        `  title = {${title}},`,
        year ? `  year = {${year}},` : '',
        `  doi = {${bibtexBraceEscape(doi)}},`,
        journal ? `  journal = {${journal}},` : '',
        url ? `  url = {${bibtexBraceEscape(url)}},` : '',
        '}',
      ]
      blocks.push(lines.filter(Boolean).join('\n'))
    } else {
      const lines = [
        `@misc{${key},`,
        `  title = {${title}},`,
        year ? `  year = {${year}},` : '',
        journal ? `  howpublished = {${journal}},` : '',
        url ? `  url = {${bibtexBraceEscape(url)}},` : '',
        '}',
      ]
      blocks.push(lines.filter(Boolean).join('\n'))
    }
  }
  return blocks.join('\n\n')
}

export function publicationsToRis(rows: PublicationInput[]): string {
  if (!rows.length) return ''
  const parts: string[] = []
  for (const p of rows) {
    const block: string[] = ['TY  - JOUR']
    const t = risLine('TI', p.title)
    if (t) block.push(t)
    if (p.year != null) block.push(`PY  - ${Math.trunc(p.year)}`)
    const doi = (p.doi || '').trim()
    if (doi) block.push(risLine('DO', doi))
    const url = (p.url || '').trim()
    if (url) block.push(risLine('UR', url))
    const src = (p.source || '').trim()
    if (src) block.push(risLine('JO', src))
    block.push('ER  - ')
    parts.push(block.filter(Boolean).join('\n'))
  }
  return parts.join('\n\n')
}

export function digestBodyToMarkdown(data: DigestResponse | MonthlyDigestResponse): string {
  const blocks: string[] = []
  blocks.push('## Дайджест (RU)\n')
  blocks.push(escapeMd(data.digest_ru || '—'))
  blocks.push('\n\n## Дайджест (EN)\n')
  blocks.push(escapeMd(data.digest_en || '—'))
  blocks.push('\n\n## Карточки статей\n\n')
  blocks.push(articleCardsToMarkdown(data.article_cards))
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
