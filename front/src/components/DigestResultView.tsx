import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DigestCorpusCharts } from '@/components/DigestCorpusCharts'
import { PublicationYearChart } from '@/components/PublicationYearChart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  copyTextToClipboard,
  digestBodyToMarkdown,
  downloadBlob,
  fullReportMarkdown,
  publicationsToBibtex,
  publicationsToMarkdown,
  publicationsToRis,
} from '@/lib/digestExport'
import type {
  ArticleCard,
  DigestMeta,
  DigestResponse,
  MonthlyDigestResponse,
  PublicationInput,
} from '@/types/api'

function MetaBlock({ meta }: { meta?: DigestMeta }) {
  if (!meta) return null
  const mode = meta.digest_mode ?? 'peer_reviewed'
  const modeLabel = mode === 'web_snippets' ? 'Веб-сниппеты (Tavily)' : 'Рецензируемый корпус'

  const items: { label: string; value: string | number }[] = [
    { label: 'Режим', value: modeLabel },
  ]

  if (mode === 'web_snippets') {
    items.push({ label: 'Фрагментов в обзоре', value: meta.web_snippets_used ?? '—' })
    items.push({
      label: 'Фильтр научных доменов',
      value: meta.web_scholarly_domain_filter ? 'да (Tavily include_domains)' : 'нет (весь интернет)',
    })
  } else {
    items.push(
      { label: 'Найдено в OpenAlex', value: meta.candidates_openalex ?? '—' },
      { label: 'Найдено в Semantic Scholar', value: meta.candidates_semantic_scholar ?? '—' },
      { label: 'Найдено в CORE', value: meta.candidates_core ?? '—' },
      {
        label: 'Crossref (DOI)',
        value: meta.crossref_enriched_dois ?? '—',
      },
      {
        label: 'PDF (загрузки)',
        value: meta.user_pdf_documents ?? '—',
      },
      {
        label: 'OA PDF (Unpaywall)',
        value: meta.oa_fulltext_fetched ?? '—',
      },
      {
        label: 'Двухэтапный LLM',
        value: meta.two_stage_llm === true ? 'да' : meta.two_stage_llm === false ? 'нет' : '—',
      },
      { label: 'После объединения', value: meta.after_dedupe ?? '—' },
    )
  }

  items.push(
    { label: 'В итоговый обзор', value: meta.used_for_llm ?? '—' },
    {
      label: 'Секунд',
      value:
        meta.elapsed_seconds !== undefined
          ? meta.elapsed_seconds.toFixed(1)
          : '—',
    },
  )

  return (
    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
      {items.map(({ label, value }) => (
        <span key={label}>
          <span className="font-medium text-foreground">{label}:</span> {value}
        </span>
      ))}
    </div>
  )
}

function DataSourcesNote({ meta }: { meta?: DigestMeta }) {
  const mode = meta?.digest_mode ?? 'peer_reviewed'
  const items =
    mode === 'web_snippets'
      ? ['Tavily (веб-поиск и сниппеты)', 'LLM для текста дайджеста']
      : [
          'OpenAlex',
          'Semantic Scholar (при включении на сервере)',
          'CORE (при CORE_ENABLED и ключе)',
          'Crossref — обогащение метаданных по DOI',
          'LLM для текста дайджеста',
        ]
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Источники данных: </span>
      {items.join(' · ')}
    </div>
  )
}

function DigestDisclaimer() {
  return (
    <Alert className="border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30">
      <AlertTitle className="text-amber-950 dark:text-amber-100">Ограничения и справочный характер</AlertTitle>
      <AlertDescription className="text-pretty text-amber-950/90 dark:text-amber-50/90">
        Полнота выборки зависит от открытых каталогов и источников метаданных (OpenAlex, Semantic Scholar и др.) и их
        лимитов; сервис не
        гарантирует исчерпывающий охват всех журналов. Текст дайджеста сформирован языковой моделью и носит
        справочный характер: проверяйте формулировки по первоисточникам перед цитированием в отчётности.
      </AlertDescription>
    </Alert>
  )
}

function DigestExportBar({ data }: { data: DigestResponse | MonthlyDigestResponse }) {
  const [msg, setMsg] = useState<string | null>(null)
  const isMonthly = 'structured_delta' in data && data.structured_delta != null

  async function flash(ok: string) {
    setMsg(ok)
    window.setTimeout(() => setMsg(null), 2500)
  }

  async function handleCopyFullMd() {
    const md = fullReportMarkdown(data, isMonthly ? 'Периодический дайджест' : 'Дайджест литературы')
    await copyTextToClipboard(md)
    void flash('Полный отчёт скопирован')
  }

  async function handleCopyBodyMd() {
    await copyTextToClipboard(digestBodyToMarkdown(data))
    void flash('Текст RU/EN и список публикаций скопированы')
  }

  async function handleCopyPubs() {
    await copyTextToClipboard(publicationsToMarkdown(data.publications_used))
    void flash('Список публикаций скопирован')
  }

  function downloadFullMd() {
    const md = fullReportMarkdown(data, isMonthly ? 'Периодический дайджест' : 'Дайджест литературы')
    downloadBlob('digest-report.md', md, 'text/markdown;charset=utf-8')
    void flash('Файл .md сохранён')
  }

  function downloadTxt() {
    const md = digestBodyToMarkdown(data)
    downloadBlob('digest-body.txt', md, 'text/plain;charset=utf-8')
    void flash('Файл .txt сохранён')
  }

  async function handleCopyBib() {
    await copyTextToClipboard(publicationsToBibtex(data.publications_used))
    void flash('BibTeX скопирован')
  }

  async function handleCopyRis() {
    await copyTextToClipboard(publicationsToRis(data.publications_used))
    void flash('RIS скопирован')
  }

  function downloadBib() {
    downloadBlob('publications.bib', publicationsToBibtex(data.publications_used), 'text/plain;charset=utf-8')
    void flash('Сохранён .bib')
  }

  function downloadRis() {
    downloadBlob('publications.ris', publicationsToRis(data.publications_used), 'text/plain;charset=utf-8')
    void flash('Сохранён .ris')
  }

  const hasPubs = data.publications_used.length > 0

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between print:hidden">
      <p className="text-xs font-medium text-muted-foreground">Экспорт для отчётов</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopyFullMd()}>
          Копировать полный Markdown
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyBodyMd()}>
          Копировать текст + публикации
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyPubs()}>
          Копировать список публикаций
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={downloadFullMd}>
          Скачать .md
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={downloadTxt}>
          Скачать .txt
        </Button>
        {hasPubs ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyBib()}>
              Копировать BibTeX
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleCopyRis()}>
              Копировать RIS
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadBib}>
              Скачать .bib
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={downloadRis}>
              Скачать .ris
            </Button>
          </>
        ) : null}
      </div>
      {msg ? <span className="text-xs text-muted-foreground sm:ml-auto">{msg}</span> : null}
    </div>
  )
}

function firstInsight(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  return (paragraphs[0] ?? trimmed).replace(/^#+\s*/, '').slice(0, 520)
}

function DigestMainPanel({ data }: { data: DigestResponse | MonthlyDigestResponse }) {
  const [copied, setCopied] = useState<string | null>(null)
  const insight = firstInsight(data.digest_ru)
  const questions = [
    'Какие 5 статей стоит прочитать первыми?',
    'Какие темы выглядят самыми новыми?',
    'Что можно использовать для обзора литературы?',
    'Какие направления стоит мониторить дальше?',
  ]

  async function copyQuestion(question: string) {
    await copyTextToClipboard(`${question}\n\nКонтекст: текущий KamGU Research Digest.`)
    setCopied(question)
    window.setTimeout(() => setCopied(null), 2200)
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Главное</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">Что важно в этом дайджесте</h3>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-foreground/90">
          {insight || 'Дайджест сформирован. Ниже доступны RU/EN текст, карточки публикаций и экспорт.'}
        </p>
      </div>
      <div className="rounded-lg border border-border/75 bg-card/95 p-5">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Ask this digest</p>
        <div className="mt-3 flex flex-col gap-2">
          {questions.map((question) => (
            <Button
              key={question}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto justify-start whitespace-normal py-2 text-left"
              onClick={() => void copyQuestion(question)}
            >
              {question}
            </Button>
          ))}
        </div>
        {copied ? <p className="mt-3 text-xs text-muted-foreground">Вопрос скопирован.</p> : null}
      </div>
    </section>
  )
}

function ArticleCardsList({ cards, publications }: { cards: ArticleCard[]; publications: PublicationInput[] }) {
  if (!cards.length) return <p className="text-sm text-muted-foreground">Нет карточек.</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((c, i) => {
        const summary = (c.summary_ru || c.summary_en || '').trim()
        const publication = publications[i]
        const source = publication?.source?.trim()
        const citationCount = publication?.citation_count
        const doi = publication?.doi?.trim()
        const concepts = publication?.concepts?.slice(0, 3) ?? []
        return (
          <Card key={`${c.title}-${i}`} className="border-border/75 bg-card/95 shadow-sm">
            <CardHeader className="space-y-3 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                {source ? (
                  <Badge variant="secondary" className="max-w-full truncate">
                    {source}
                  </Badge>
                ) : null}
                {c.year != null ? <Badge variant="outline">{c.year}</Badge> : null}
                {citationCount != null ? (
                  <Badge variant="outline">{citationCount} citations</Badge>
                ) : null}
                <Badge className="bg-amber-500/15 text-amber-900 hover:bg-amber-500/15 dark:text-amber-100">
                  relevance
                </Badge>
              </div>
              <CardTitle className="font-heading text-base font-semibold leading-snug tracking-tight">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {c.title}
                  </a>
                ) : (
                  c.title
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {summary ? (
                <p className="text-pretty leading-relaxed text-foreground/90">{summary}</p>
              ) : null}
              {c.why_relevant ? (
                <p className="rounded-md bg-muted/35 px-3 py-2 text-xs leading-relaxed">
                  <span className="font-medium text-foreground">Почему важно: </span>
                  {c.why_relevant}
                </p>
              ) : null}
              {concepts.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {concepts.map((concept) => (
                    <Badge key={concept.id ?? concept.display_name} variant="outline" className="font-normal">
                      {concept.display_name}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {c.bullets?.length ? (
                <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">
                  {c.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                {c.url ? (
                  <Button type="button" variant="secondary" size="sm" asChild>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      Открыть
                    </a>
                  </Button>
                ) : null}
                {publication?.oa_url ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={publication.oa_url} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </Button>
                ) : null}
                {doi ? (
                  <span className="inline-flex min-w-0 items-center rounded-md border border-border/80 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    <span className="truncate">doi:{doi}</span>
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function PublicationsTable({ rows }: { rows: PublicationInput[] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Нет публикаций.</p>
  }
  const showOa = rows.some(
    (p) => p.is_open_access != null || (p.oa_url && p.oa_url.length > 0),
  )
  return (
    <ScrollArea className="h-[min(420px,50vh)] w-full rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead className="w-20">Год</TableHead>
            <TableHead className="w-28">Источник</TableHead>
            {showOa ? <TableHead className="w-24">OA</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p, i) => (
            <TableRow key={`${p.doi ?? p.title}-${i}`}>
              <TableCell className="min-w-0 max-w-[min(480px,40vw)]">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {p.title}
                  </a>
                ) : (
                  p.title
                )}
                {p.abstract ? (
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed" title={p.abstract}>
                    {p.abstract}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{p.year ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{p.source || '—'}</TableCell>
              {showOa ? (
                <TableCell className="text-xs">
                  {p.oa_url ? (
                    <a href={p.oa_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                      {p.is_open_access === true ? 'открытая копия' : 'ссылка'}
                    </a>
                  ) : p.is_open_access === false ? (
                    'нет'
                  ) : (
                    '—'
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}

function DigestText({ text }: { text: string }) {
  return (
    <ScrollArea className="h-[min(480px,55vh)] w-full rounded-md border">
      <div className="digest-prose mx-auto max-w-prose p-4 md:p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">{text || '—'}</pre>
      </div>
    </ScrollArea>
  )
}

export function DigestResultView(props: {
  loading?: boolean
  loadingHint?: string
  error?: string | null
  data?: DigestResponse | MonthlyDigestResponse | null
}) {
  const { loading, loadingHint, error, data } = props

  if (loading) {
    return (
      <div className="space-y-4">
        {loadingHint ? (
          <p className="text-sm text-muted-foreground leading-relaxed">{loadingHint}</p>
        ) : null}
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ошибка</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return null
  }

  const warnings = data.meta?.warnings ?? []
  const mode = data.meta?.digest_mode ?? 'peer_reviewed'

  return (
    <div className="space-y-6">
      <DigestMainPanel data={data} />

      <DigestDisclaimer />
      <DataSourcesNote meta={data.meta} />

      {mode === 'web_snippets' ? (
        <Alert>
          <AlertTitle>Веб-обзор по сниппетам</AlertTitle>
          <AlertDescription>
            Текст основан на коротких выдержках из поиска (Tavily), а не на полном рецензируемом корпусе.
          </AlertDescription>
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Предупреждения</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 mt-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border/75 bg-card/90 p-4">
        <DigestExportBar data={data} />
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Метаданные</h3>
          <MetaBlock meta={data.meta} />
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="ru">
        <TabsList className="print:hidden">
          <TabsTrigger value="ru">Дайджест RU</TabsTrigger>
          <TabsTrigger value="en">Дайджест EN</TabsTrigger>
        </TabsList>
        <TabsContent value="ru" className="mt-4">
          <DigestText text={data.digest_ru} />
        </TabsContent>
        <TabsContent value="en" className="mt-4">
          <DigestText text={data.digest_en} />
        </TabsContent>
      </Tabs>

      <div>
        <h3 className="text-lg font-heading font-semibold mb-3">Карточки публикаций</h3>
        <ArticleCardsList cards={data.article_cards} publications={data.publications_used} />
      </div>

      {data.publications_used.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-heading font-semibold mb-1">Аналитика корпуса</h3>
            <p className="mb-3 text-sm text-muted-foreground text-pretty max-w-3xl">
              Распределения и сводки по работам, попавшим в дайджест: годы, цитирования, источники
              {mode === 'peer_reviewed' ? ', концепты OpenAlex и открытый доступ' : ', домены URL для веб-сниппетов'}.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <PublicationYearChart publications={data.publications_used} />
            <DigestCorpusCharts publications={data.publications_used} mode={mode} />
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="text-lg font-heading font-semibold mb-3">
          {mode === 'web_snippets' ? 'Источники (сниппеты)' : 'Использованные публикации'}
        </h3>
        <PublicationsTable rows={data.publications_used} />
      </div>
    </div>
  )
}
