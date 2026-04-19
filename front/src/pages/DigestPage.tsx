import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'

import { DigestPresetsBar } from '@/components/DigestPresetsBar'
import { DigestResultView } from '@/components/DigestResultView'
import { PageOnboarding } from '@/components/PageOnboarding'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, createDigest, saveDigest, uploadPdfDocument } from '@/lib/api'
import type { DigestFormPreset } from '@/lib/digestPresets'
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

const TOPIC_TEMPLATES: { label: string; topics: string[] }[] = [
  { label: 'Квантовые вычисления', topics: ['quantum computing', 'квантовые вычисления'] },
  { label: 'ВИЭ и энергетика', topics: ['renewable energy', 'энергетика ВИЭ'] },
  { label: 'LLM и NLP', topics: ['large language models', 'обработка естественного языка'] },
]

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
  const [fetchOaFulltext, setFetchOaFulltext] = useState(false)
  const [deepDigest, setDeepDigest] = useState(false)

  const [pdfAttachments, setPdfAttachments] = useState<{ id: string; name: string }[]>([])
  const [pdfUploading, setPdfUploading] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DigestResponse | null>(null)
  const [lastRequestSnapshot, setLastRequestSnapshot] = useState<DigestRequest | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  function addTopic() {
    setTopics((t) => [...t, ''])
  }

  function setTopic(i: number, v: string) {
    setTopics((t) => t.map((x, j) => (j === i ? v : x)))
  }

  function removeTopic(i: number) {
    setTopics((t) => t.filter((_, j) => j !== i))
  }

  useEffect(() => {
    if (digestMode !== 'peer_reviewed') {
      setPdfAttachments([])
    }
  }, [digestMode])

  async function handlePdfFiles(files: FileList | null) {
    if (!files?.length) return
    setPdfUploading(true)
    setError(null)
    try {
      const added: { id: string; name: string }[] = []
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith('.pdf')) {
          setError('Можно загружать только файлы .pdf')
          continue
        }
        const res = await uploadPdfDocument(apiBase, f)
        added.push({ id: res.id, name: f.name })
      }
      if (added.length) {
        setPdfAttachments((prev) => [...prev, ...added])
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setPdfUploading(false)
    }
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
      if (pdfAttachments.length) {
        body.attached_document_ids = pdfAttachments.map((p) => p.id)
      }
      body.fetch_oa_fulltext = fetchOaFulltext
      body.deep_digest = deepDigest
    }

    if (digestMode === 'web_snippets') {
      body.web_scholarly_sources_only = webScholarlyOnly
      const extras = parseDois(webExtraTerms)
      if (extras.length) body.web_search_additional_terms = extras
    }

    setLoading(true)
    setData(null)
    setLastRequestSnapshot(null)
    try {
      const res = await createDigest(apiBase, body)
      setData(res)
      setLastRequestSnapshot(body)
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

  function openSaveSheet() {
    const q = topics.map((s) => s.trim()).filter(Boolean)
    const head = q[0]?.slice(0, 60) ?? 'Дайджест'
    setSaveTitle(
      `${new Date().toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} — ${head}`,
    )
    setSaveError(null)
    setSavedId(null)
    setSaveOpen(true)
  }

  async function handleSaveToServer() {
    if (!data || !lastRequestSnapshot) return
    const t = saveTitle.trim()
    if (!t) {
      setSaveError('Введите название.')
      return
    }
    setSaveBusy(true)
    setSaveError(null)
    try {
      const created = await saveDigest(apiBase, {
        title: t,
        digest_response: data,
        request_snapshot: lastRequestSnapshot,
      })
      setSavedId(created.id)
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message)
      } else {
        setSaveError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSaveBusy(false)
    }
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

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      <PageOnboarding
        title="Как получить разовый дайджест"
        steps={[
          {
            title: 'Темы и режим',
            detail:
              'Задайте одну или несколько поисковых строк (удобно дублировать на EN/RU). Выберите рецензируемый корпус или веб-обзор по сниппетам.',
          },
          {
            title: 'Пресеты и примеры',
            detail: 'Сохраните частые наборы параметров в пресетах или подставьте готовый пример тем одной кнопкой.',
          },
          {
            title: 'Запуск и результат',
            detail:
              'После «Сформировать дайджест» подождите 5–15 минут; затем появится текст RU/EN, карточки и экспорт в Markdown.',
          },
        ]}
      />

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
            <DigestPresetsBar onApply={applyPreset} snapshot={presetSnapshot} />

            <div className="flex flex-wrap gap-2">
              <span className="w-full text-xs font-medium text-muted-foreground">Примеры тем (подставить в строки)</span>
              {TOPIC_TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setTopics([...t.topics])}
                >
                  {t.label}
                </Button>
              ))}
            </div>

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
              <p className="text-xs text-muted-foreground">
                Короткие фразы по сути темы; дублирование на двух языках улучшает отбор в OpenAlex.
              </p>
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
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/15 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="fetch-oa"
                      checked={fetchOaFulltext}
                      onCheckedChange={(c) => setFetchOaFulltext(c === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="fetch-oa" className="cursor-pointer text-sm font-medium leading-snug">
                        OA-полнотекст по DOI (Unpaywall)
                      </Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Для открытых статей сервер запрашивает ссылку на PDF через Unpaywall, скачивает файл, извлекает
                        текст и подмешивает его в анализ (кэш на диске). На сервере должен быть указан email
                        для Unpaywall: переменные окружения{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">OPENALEX_MAILTO</code> или{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">UNPAYWALL_EMAIL</code>.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="deep-digest"
                      checked={deepDigest}
                      onCheckedChange={(c) => setDeepDigest(c === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="deep-digest" className="cursor-pointer text-sm font-medium leading-snug">
                        Глубокий дайджест (двухэтапный LLM)
                      </Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Сначала краткая выжимка по каждой статье, затем общий обзор. Удобно при длинных PDF и больших
                        выборках; автоматически включается и при очень большом объёме текста. Больше вызовов к API
                        модели.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border/80 bg-muted/15 p-4">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Свои PDF (необязательно)</Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Файлы отправляются на сервер, из них извлекается текст и они участвуют в общем отборе вместе с
                      OpenAlex и др. Для веб-режима (Tavily) загрузки не используются.
                    </p>
                  </div>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    onChange={(ev) => {
                      void handlePdfFiles(ev.target.files)
                      ev.target.value = ''
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={loading || pdfUploading}
                      onClick={() => pdfInputRef.current?.click()}
                    >
                      {pdfUploading ? 'Загрузка…' : 'Добавить PDF'}
                    </Button>
                    {pdfAttachments.length ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => setPdfAttachments([])}
                      >
                        Очистить список
                      </Button>
                    ) : null}
                  </div>
                  {pdfAttachments.length ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {pdfAttachments.map((p) => (
                        <li key={p.id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-mono text-[11px]" title={p.id}>
                            {p.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2 text-xs"
                            onClick={() => setPdfAttachments((prev) => prev.filter((x) => x.id !== p.id))}
                          >
                            Убрать
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
            <p className="mt-1 text-xs text-muted-foreground/90">Текст дайджеста и карточки источников</p>
          </div>
          {data && !loading ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="print:hidden"
              onClick={() => openSaveSheet()}
            >
              Сохранить в архив
            </Button>
          ) : null}
        </div>
        {!loading && !data && !error ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
            Здесь появится дайджест на русском и английском, карточки статей и таблица публикаций. Время
            генерации зависит от объёма; типичный ориентир — несколько минут.
          </p>
        ) : null}
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

      <Sheet open={saveOpen} onOpenChange={setSaveOpen}>
        <SheetContent className="flex flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Сохранить в архив</SheetTitle>
            <SheetDescription>
              Запись будет доступна в разделе «Сохранённые» (та же база на сервере, что и тренды).
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="save-title">Название</Label>
              <Input
                id="save-title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="Краткая подпись"
              />
            </div>
            {saveError ? (
              <Alert variant="destructive">
                <AlertDescription>{saveError}</AlertDescription>
              </Alert>
            ) : null}
            {savedId ? (
              <Alert>
                <AlertTitle>Сохранено</AlertTitle>
                <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span>Можно открыть в архиве.</span>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link to={`/saved/${savedId}`}>Открыть</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <SheetFooter className="mt-auto gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Закрыть
            </Button>
            <Button type="button" disabled={saveBusy || !!savedId} onClick={() => void handleSaveToServer()}>
              {saveBusy ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
