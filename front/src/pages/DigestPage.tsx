import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, createDigest } from '@/lib/api'
import type { DigestMode, DigestRequest, DigestResponse } from '@/types/api'

function parseYear(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number.parseInt(t, 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function parseDois(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseSourceIds(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function DigestPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [topics, setTopics] = useState<string[]>(['quantum computing', 'квантовые вычисления'])
  const [digestMode, setDigestMode] = useState<DigestMode>('peer_reviewed')
  const [peerReviewedOnly, setPeerReviewedOnly] = useState(true)
  const [openalexConceptId, setOpenalexConceptId] = useState('')
  const [openalexSourceIds, setOpenalexSourceIds] = useState('')
  const [maxCandidates, setMaxCandidates] = useState('100')
  const [topN, setTopN] = useState('20')
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [excludeDois, setExcludeDois] = useState('')
  const [webScholarlyOnly, setWebScholarlyOnly] = useState(true)
  const [webExtraTerms, setWebExtraTerms] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DigestResponse | null>(null)

  function addTopic() {
    setTopics((t) => [...t, ''])
  }

  function setTopic(i: number, v: string) {
    setTopics((t) => t.map((x, j) => (j === i ? v : x)))
  }

  function removeTopic(i: number) {
    setTopics((t) => t.filter((_, j) => j !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const queries = topics.map((s) => s.trim()).filter(Boolean)
    if (!queries.length) {
      setError('Добавьте хотя бы одну поисковую строку.')
      return
    }
    const mc = Number.parseInt(maxCandidates, 10)
    const tn = Number.parseInt(topN, 10)
    if (!Number.isFinite(mc) || mc < 10 || mc > 200) {
      setError('max_candidates: число от 10 до 200')
      return
    }
    if (!Number.isFinite(tn) || tn < 3 || tn > 40) {
      setError('top_n_for_llm: число от 3 до 40')
      return
    }

    const body: DigestRequest = {
      topic_queries: queries,
      digest_mode: digestMode,
      max_candidates: mc,
      top_n_for_llm: tn,
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
    }

    if (digestMode === 'web_snippets') {
      body.web_scholarly_sources_only = webScholarlyOnly
      const extras = parseDois(webExtraTerms)
      if (extras.length) body.web_search_additional_terms = extras
    }

    setLoading(true)
    setData(null)
    try {
      const res = await createDigest(apiBase, body)
      setData(res)
    } catch (err) {
      setData(null)
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Параметры дайджеста</CardTitle>
          <CardDescription className="text-pretty">
            Режим «рецензируемый корпус»: OpenAlex (и опционально Semantic Scholar). Режим «веб-обзор»:
            короткие сниппеты через Tavily + LLM, с отдельным дисклеймером. После отправки запрос может
            выполняться долго (ориентир 5–15 минут в зависимости от объёма и прокси); не закрывайте вкладку.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="digest-mode">Режим</Label>
              <Select
                value={digestMode}
                onValueChange={(v) => setDigestMode(v as DigestMode)}
              >
                <SelectTrigger id="digest-mode" className="h-auto min-h-10 w-full max-w-xl py-2 whitespace-normal">
                  <SelectValue placeholder="Выберите режим" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="peer_reviewed">Рецензируемый корпус (OpenAlex / Semantic Scholar)</SelectItem>
                  <SelectItem value="web_snippets">Веб-обзор по сниппетам (Tavily)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {digestMode === 'web_snippets' ? (
              <>
                <Alert className="border-primary/25 bg-primary/5">
                  <AlertTitle>Веб-обзор</AlertTitle>
                  <AlertDescription>
                    Это не систематический обзор литературы и не каталог рецензируемых статей. На сервере нужен{' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">TAVILY_API_KEY</code>. По умолчанию поиск
                    ограничен научными доменами (PubMed, arXiv, Nature, …), а не всем интернетом.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/15 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="web-scholarly" className="text-sm font-medium">
                        Только научные сайты
                      </Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Tavily ищет в списке академических доменов. Отключите, чтобы искать по всей сети (менее
                        предсказуемо).
                      </p>
                    </div>
                    <Switch
                      id="web-scholarly"
                      checked={webScholarlyOnly}
                      onCheckedChange={setWebScholarlyOnly}
                      className="shrink-0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="web-extra">Дополнительные ключевые слова к запросу (через запятую)</Label>
                    <Input
                      id="web-extra"
                      value={webExtraTerms}
                      onChange={(e) => setWebExtraTerms(e.target.value)}
                      placeholder="например: photovoltaic, perovskite"
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="space-y-2">
              <Label>Поисковые строки (RU/EN)</Label>
              {topics.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={t}
                    onChange={(e) => setTopic(i, e.target.value)}
                    placeholder="Тема"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeTopic(i)}
                    disabled={topics.length <= 1}
                    aria-label="Удалить строку"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button type="button" variant="secondary" size="sm" onClick={addTopic}>
                Добавить строку
              </Button>
            </div>

            {digestMode === 'peer_reviewed' ? (
              <>
                <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/15 p-4">
                  <Checkbox
                    id="peer-only"
                    checked={peerReviewedOnly}
                    onCheckedChange={(c) => setPeerReviewedOnly(c === true)}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor="peer-only" className="cursor-pointer text-sm font-medium leading-snug">
                      Только журнальные статьи
                    </Label>
                    <p className="text-xs text-muted-foreground">OpenAlex: type:article</p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="concept-id">OpenAlex concept id (необязательно)</Label>
                    <Input
                      id="concept-id"
                      value={openalexConceptId}
                      onChange={(e) => setOpenalexConceptId(e.target.value)}
                      placeholder="C2778805519 или полный URL"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="source-ids">OpenAlex source id (журналы), через запятую</Label>
                    <Input
                      id="source-ids"
                      value={openalexSourceIds}
                      onChange={(e) => setOpenalexSourceIds(e.target.value)}
                      placeholder="S123... или https://openalex.org/S..."
                    />
                  </div>
                </div>
              </>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="max-c">max_candidates</Label>
                <Input
                  id="max-c"
                  type="number"
                  min={10}
                  max={200}
                  value={maxCandidates}
                  onChange={(e) => setMaxCandidates(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="top-n">top_n_for_llm</Label>
                <Input
                  id="top-n"
                  type="number"
                  min={3}
                  max={40}
                  value={topN}
                  onChange={(e) => setTopN(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="from-y">Год от (необязательно)</Label>
                <Input
                  id="from-y"
                  type="number"
                  min={1900}
                  max={2100}
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                  placeholder="например 2020"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-y">Год до (необязательно)</Label>
                <Input
                  id="to-y"
                  type="number"
                  min={1900}
                  max={2100}
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                  placeholder="пусто = без верхней границы"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exclude">Исключить DOI (через запятую или с новой строки)</Label>
              <Textarea
                id="exclude"
                value={excludeDois}
                onChange={(e) => setExcludeDois(e.target.value)}
                rows={3}
                placeholder="10.1234/..."
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={loading} size="lg" className="min-w-[200px]">
              {loading ? 'Формирование…' : 'Сформировать дайджест'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
          <p className="mt-1 text-xs text-muted-foreground/90">Текст дайджеста и карточки источников</p>
        </div>
        <DigestResultView
          loading={loading}
          loadingHint={
            loading
              ? 'Идёт сбор публикаций и вызов LLM — это может занять несколько минут. Оставьте страницу открытой.'
              : undefined
          }
          error={error && !data ? error : null}
          data={data}
        />
      </section>
    </div>
  )
}
