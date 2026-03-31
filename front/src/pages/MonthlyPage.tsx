import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, createMonthlyDigest } from '@/lib/api'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { MonthlyDigestRequest, MonthlyDigestResponse } from '@/types/api'

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

export function MonthlyPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [profileId, setProfileId] = useState('default')
  const [topics, setTopics] = useState<string[]>(['renewable energy', 'энергетика ВИЭ'])
  const [maxCandidates, setMaxCandidates] = useState('100')
  const [topN, setTopN] = useState('20')
  const [trendTopK, setTrendTopK] = useState('20')
  const [fromYear, setFromYear] = useState('')
  const [toYear, setToYear] = useState('')
  const [excludeDois, setExcludeDois] = useState('')
  const [forcePeriod, setForcePeriod] = useState('')
  const [internalKeyField, setInternalKeyField] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<MonthlyDigestResponse | null>(null)

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
    const pid = profileId.trim()
    if (!pid) {
      setError('Укажите profile_id.')
      return
    }
    const mc = Number.parseInt(maxCandidates, 10)
    const tn = Number.parseInt(topN, 10)
    const tk = Number.parseInt(trendTopK, 10)
    if (!Number.isFinite(mc) || mc < 10 || mc > 200) {
      setError('max_candidates: число от 10 до 200')
      return
    }
    if (!Number.isFinite(tn) || tn < 3 || tn > 40) {
      setError('top_n_for_llm: число от 3 до 40')
      return
    }
    if (!Number.isFinite(tk) || tk < 5 || tk > 60) {
      setError('trend_top_k: число от 5 до 60')
      return
    }

    const fp = forcePeriod.trim()
    const body: MonthlyDigestRequest = {
      profile_id: pid,
      topic_queries: queries,
      max_candidates: mc,
      top_n_for_llm: tn,
      trend_top_k: tk,
      from_year: parseYear(fromYear),
      to_year: parseYear(toYear),
      exclude_dois: parseDois(excludeDois),
      force_period: fp ? fp : null,
    }

    const keyOverride = internalKeyField.trim()
    const internalKey = keyOverride || getMonthlyInternalKey()

    setLoading(true)
    setData(null)
    try {
      const res = await createMonthlyDigest(apiBase, body, { internalKey })
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

  const meta = data?.meta

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Периодический дайджест с трендами</CardTitle>
          <CardDescription className="text-pretty">
            API: <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /digests/periodic</code> (совместимо с{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/digests/monthly</code>). Частота запусков
            (месяц, квартал и т.д.) задаётся внешним планировщиком. Снимок в БД на сервере, сравнение с прошлым
            периодом и LLM-текст. Запрос может длиться 5–15 минут. Если на бэкенде задан секрет, передайте его в
            настройках или в поле ниже.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="profile">profile_id</Label>
              <Input
                id="profile"
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                placeholder="идентификатор профиля направления"
              />
            </div>

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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="space-y-2">
                <Label htmlFor="trend-k">trend_top_k</Label>
                <Input
                  id="trend-k"
                  type="number"
                  min={5}
                  max={60}
                  value={trendTopK}
                  onChange={(e) => setTrendTopK(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="from-y">Год от</Label>
                <Input
                  id="from-y"
                  type="number"
                  min={1900}
                  max={2100}
                  value={fromYear}
                  onChange={(e) => setFromYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="to-y">Год до</Label>
                <Input
                  id="to-y"
                  type="number"
                  min={1900}
                  max={2100}
                  value={toYear}
                  onChange={(e) => setToYear(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="force">force_period (YYYY-MM, опционально)</Label>
              <Input
                id="force"
                value={forcePeriod}
                onChange={(e) => setForcePeriod(e.target.value)}
                placeholder="2025-03 — переопределить период снимка"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exclude">Исключить DOI</Label>
              <Textarea
                id="exclude"
                value={excludeDois}
                onChange={(e) => setExcludeDois(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="x-int">X-Internal-Key (перекрывает сохранённый в настройках)</Label>
              <Input
                id="x-int"
                value={internalKeyField}
                onChange={(e) => setInternalKeyField(e.target.value)}
                placeholder="оставьте пустым — возьмём из настроек"
                autoComplete="off"
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" disabled={loading} size="lg" className="min-w-[240px]">
              {loading ? 'Формирование…' : 'Запустить периодический дайджест'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
          <p className="mt-1 text-xs text-muted-foreground/90">Дайджест, метаданные и структурированные тренды</p>
        </div>
        {data && meta ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {meta.profile_id ? (
              <Badge variant="secondary">profile: {meta.profile_id}</Badge>
            ) : null}
            {meta.period ? <Badge variant="outline">период: {meta.period}</Badge> : null}
            {meta.compared_period != null && meta.compared_period !== '' ? (
              <Badge variant="outline">сравнение с: {meta.compared_period}</Badge>
            ) : null}
            {meta.snapshot_saved != null ? (
              <Badge variant={meta.snapshot_saved ? 'default' : 'secondary'}>
                снимок: {meta.snapshot_saved ? 'сохранён' : 'не сохранён'}
              </Badge>
            ) : null}
          </div>
        ) : null}
        <DigestResultView
          loading={loading}
          loadingHint={
            loading
              ? 'Снимок и сравнение с предыдущим периодом плюс LLM — ориентир 5–15 минут. Не закрывайте вкладку.'
              : undefined
          }
          error={error && !data ? error : null}
          data={data ?? undefined}
        />
        {data?.structured_delta ? (
          <div className="mt-10 space-y-4">
            <h3 className="text-lg font-heading font-medium">Структурированные тренды</h3>
            <StructuredDeltaView delta={data.structured_delta} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
