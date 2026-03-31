import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
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
import type { ArticleCard, DigestMeta, DigestResponse, PublicationInput } from '@/types/api'

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

function ArticleCardsList({ cards }: { cards: ArticleCard[] }) {
  if (!cards.length) return <p className="text-sm text-muted-foreground">Нет карточек.</p>
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((c, i) => (
        <Card key={`${c.title}-${i}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base leading-snug">
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
    <ScrollArea className="h-[min(480px,55vh)] w-full rounded-md border p-4">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{text || '—'}</pre>
    </ScrollArea>
  )
}

export function DigestResultView(props: {
  loading?: boolean
  error?: string | null
  data?: DigestResponse | null
}) {
  const { loading, error, data } = props

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
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

      <div>
        <h3 className="text-lg font-medium mb-2">Мета</h3>
        <MetaBlock meta={data.meta} />
      </div>

      <Separator />

      <Tabs defaultValue="ru">
        <TabsList>
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
        <h3 className="text-lg font-medium mb-3">Карточки</h3>
        <ArticleCardsList cards={data.article_cards} />
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">
          {mode === 'web_snippets' ? 'Источники (сниппеты)' : 'Использованные публикации'}
        </h3>
        <PublicationsTable rows={data.publications_used} />
      </div>
    </div>
  )
}
