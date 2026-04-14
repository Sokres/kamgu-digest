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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  copyTextToClipboard,
  digestBodyToMarkdown,
  downloadBlob,
  fullReportMarkdown,
  publicationsToMarkdown,
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
    items.push({ label: 'Сниппетов в LLM', value: meta.web_snippets_used ?? '—' })
    items.push({
      label: 'Фильтр научных доменов',
      value: meta.web_scholarly_domain_filter ? 'да (Tavily include_domains)' : 'нет (весь интернет)',
    })
  } else {
    items.push(
      { label: 'OpenAlex', value: meta.candidates_openalex ?? '—' },
      { label: 'Semantic Scholar', value: meta.candidates_semantic_scholar ?? '—' },
      { label: 'CORE', value: meta.candidates_core ?? '—' },
      {
        label: 'Crossref (DOI)',
        value: meta.crossref_enriched_dois ?? '—',
      },
      {
        label: 'PDF (загрузки)',
        value: meta.user_pdf_documents ?? '—',
      },
      { label: 'После дедупа', value: meta.after_dedupe ?? '—' },
    )
  }

  items.push(
    { label: 'В LLM', value: meta.used_for_llm ?? '—' },
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
        Полнота выборки зависит от открытых API (OpenAlex, Semantic Scholar и др.) и их лимитов; сервис не
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
      </div>
      {msg ? <span className="text-xs text-muted-foreground sm:ml-auto">{msg}</span> : null}
    </div>
  )
}

function ArticleCardsList({ cards }: { cards: ArticleCard[] }) {
  if (!cards.length) return <p className="text-sm text-muted-foreground">Нет карточек.</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((c, i) => (
        <Card key={`${c.title}-${i}`}>
          <CardHeader className="pb-2">
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
              {c.year != null ? (
                <Badge variant="secondary" className="ml-2 align-middle">
                  {c.year}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {c.why_relevant ? (
              <p>
                <span className="font-medium">Релевантность:</span> {c.why_relevant}
              </p>
            ) : null}
            {c.bullets?.length ? (
              <ul className="list-disc pl-4 space-y-1">
                {c.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}
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
              <TableCell className="max-w-[min(480px,40vw)]">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {p.title}
                  </a>
                ) : (
                  p.title
                )}
                {p.abstract ? (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.abstract}</p>
                ) : null}
              </TableCell>
              <TableCell>{p.year ?? '—'}</TableCell>
              <TableCell className="text-xs">{p.source || '—'}</TableCell>
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

      <DigestExportBar data={data} />

      <div>
        <h3 className="text-lg font-heading font-semibold mb-2">Мета</h3>
        <MetaBlock meta={data.meta} />
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
        <h3 className="text-lg font-heading font-semibold mb-3">Карточки</h3>
        <ArticleCardsList cards={data.article_cards} />
      </div>

      <div>
        <h3 className="text-lg font-heading font-semibold mb-3">
          {mode === 'web_snippets' ? 'Источники (сниппеты)' : 'Использованные публикации'}
        </h3>
        <PublicationsTable rows={data.publications_used} />
      </div>
    </div>
  )
}
