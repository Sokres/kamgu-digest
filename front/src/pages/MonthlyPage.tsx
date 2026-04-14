import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { DigestResultView } from '@/components/DigestResultView'
import { PageOnboarding } from '@/components/PageOnboarding'
import { StructuredDeltaView } from '@/components/StructuredDeltaView'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ApiError,
  createDigestSchedule,
  createMonthlyDigest,
  deleteDigestSchedule,
  fetchDigestSchedules,
  patchDigestSchedule,
} from '@/lib/api'
import { getMonthlyInternalKey } from '@/lib/settings'
import type {
  DigestSchedulesListResponse,
  MonthlyDigestRequest,
  MonthlyDigestResponse,
} from '@/types/api'

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

const CRON_PRESETS: { id: string; label: string; cron: string }[] = [
  { id: 'monthly', label: '1-е число, 06:00 UTC', cron: '0 6 1 * *' },
  { id: 'quarter', label: '1-е число квартала, 06:00 UTC', cron: '0 6 1 1,4,7,10 *' },
  { id: 'weekly', label: 'Понедельник, 06:00 UTC', cron: '0 6 * * 1' },
  { id: 'daily', label: 'Каждый день, 06:00 UTC', cron: '0 6 * * *' },
  { id: 'custom', label: 'Свой crontab (UTC)', cron: '' },
]

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

  const [digestSchedules, setDigestSchedules] = useState<DigestSchedulesListResponse | null>(null)
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [schedulesError, setSchedulesError] = useState<string | null>(null)
  const [schSubmitting, setSchSubmitting] = useState(false)
  const [schProfileId, setSchProfileId] = useState('default')
  const [schCron, setSchCron] = useState('0 6 1 * *')
  const [schPreset, setSchPreset] = useState('monthly')
  const [schTopicText, setSchTopicText] = useState('renewable energy\nэнергетика ВИЭ')

  const internalKeyRef = useRef(internalKeyField)
  internalKeyRef.current = internalKeyField

  const loadSchedulesList = useCallback(async () => {
    const internalKey = internalKeyRef.current.trim() || getMonthlyInternalKey()
    setSchedulesLoading(true)
    setSchedulesError(null)
    try {
      const res = await fetchDigestSchedules(apiBase, { internalKey })
      setDigestSchedules(res)
    } catch (err) {
      setDigestSchedules(null)
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSchedulesLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void loadSchedulesList()
  }, [loadSchedulesList])

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

  function scheduleInternalKey() {
    return internalKeyField.trim() || getMonthlyInternalKey()
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSchedulesError(null)
    const queries = schTopicText.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    if (!queries.length) {
      setSchedulesError('В расписании укажите хотя бы одну тему (по строке).')
      return
    }
    const pid = schProfileId.trim()
    if (!pid) {
      setSchedulesError('Укажите profile_id для расписания.')
      return
    }
    const mc = Number.parseInt(maxCandidates, 10)
    const tn = Number.parseInt(topN, 10)
    const tk = Number.parseInt(trendTopK, 10)
    if (!Number.isFinite(mc) || mc < 10 || mc > 200) {
      setSchedulesError('max_candidates: число от 10 до 200')
      return
    }
    if (!Number.isFinite(tn) || tn < 3 || tn > 40) {
      setSchedulesError('top_n_for_llm: число от 3 до 40')
      return
    }
    if (!Number.isFinite(tk) || tk < 5 || tk > 60) {
      setSchedulesError('trend_top_k: число от 5 до 60')
      return
    }
    const cron = schCron.trim()
    if (!cron) {
      setSchedulesError('Укажите crontab (5 полей, UTC).')
      return
    }
    setSchSubmitting(true)
    try {
      await createDigestSchedule(
        apiBase,
        {
          profile_id: pid,
          cron_utc: cron,
          enabled: true,
          topic_queries: queries,
          max_candidates: mc,
          top_n_for_llm: tn,
          trend_top_k: tk,
          from_year: parseYear(fromYear),
          to_year: parseYear(toYear),
          exclude_dois: parseDois(excludeDois),
        },
        { internalKey: scheduleInternalKey() },
      )
      await loadSchedulesList()
    } catch (err) {
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSchSubmitting(false)
    }
  }

  async function handleToggleSchedule(id: string, enabled: boolean) {
    setSchedulesError(null)
    try {
      await patchDigestSchedule(apiBase, id, { enabled: !enabled }, { internalKey: scheduleInternalKey() })
      await loadSchedulesList()
    } catch (err) {
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!window.confirm('Удалить это расписание?')) return
    setSchedulesError(null)
    try {
      await deleteDigestSchedule(apiBase, id, { internalKey: scheduleInternalKey() })
      await loadSchedulesList()
    } catch (err) {
      if (err instanceof ApiError) {
        setSchedulesError(err.message)
      } else {
        setSchedulesError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  const meta = data?.meta

  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-8">
      <PageOnboarding
        title="Периодический режим: снимок и сравнение"
        steps={[
          {
            title: 'Профиль и темы',
            detail:
              'Укажите устойчивый profile_id для направления и те же темы, что будете использовать при плановых запусках.',
          },
          {
            title: 'Расписание',
            detail:
              'Можно задать встроенное расписание (ниже) при DIGEST_PERIODIC_SCHEDULER_ENABLED на сервере или вызывать POST /digests/periodic из внешнего cron.',
          },
          {
            title: 'Снимок в БД',
            detail:
              'После успешного запуска сравнение с прошлым периодом и тренды доступны на странице «Тренды».',
          },
        ]}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Периодический дайджест с трендами</CardTitle>
          <CardDescription className="text-pretty">
            API: <code className="rounded bg-muted px-1 py-0.5 text-xs">POST /digests/periodic</code> (совместимо с{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/digests/monthly</code>). Разовый запуск: снимок в
            БД, сравнение с прошлым периодом и LLM-текст (5–15 минут). Периодичность — блок «Расписание» ниже или
            внешний cron. Если на бэкенде задан секрет, передайте его в настройках или в поле ниже.
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

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl">Расписание (встроенный планировщик)</CardTitle>
              <CardDescription className="text-pretty mt-1 max-w-2xl">
                GET/POST <code className="rounded bg-muted px-1 py-0.5 text-xs">/digests/schedules</code>. Нужны БД
                снимков и <code className="rounded bg-muted px-1 py-0.5 text-xs">DIGEST_PERIODIC_SCHEDULER_ENABLED=true</code>{' '}
                на сервере (один воркер uvicorn). Crontab в{' '}
                <span className="whitespace-nowrap">UTC</span>, пять полей: минута час день месяц день_недели.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" disabled={schedulesLoading} onClick={() => void loadSchedulesList()}>
              {schedulesLoading ? 'Загрузка…' : 'Обновить список'}
            </Button>
          </div>
          {digestSchedules ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant={digestSchedules.scheduler_enabled_in_config ? 'default' : 'secondary'}>
                планировщик в .env: {digestSchedules.scheduler_enabled_in_config ? 'вкл' : 'выкл'}
              </Badge>
              <Badge variant={digestSchedules.scheduler_running ? 'default' : 'outline'}>
                процесс: {digestSchedules.scheduler_running ? 'запущен' : 'не запущен'}
              </Badge>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-6">
          {schedulesError ? (
            <Alert variant="destructive">
              <AlertDescription>{schedulesError}</AlertDescription>
            </Alert>
          ) : null}

          {digestSchedules && digestSchedules.items.length > 0 ? (
            <ul className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3 text-sm">
              {digestSchedules.items.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="font-medium truncate">
                      {s.profile_id}{' '}
                      <span className="text-muted-foreground font-normal">· {s.cron_utc}</span>
                    </div>
                    <div className="text-xs text-muted-foreground break-all">
                      {s.topic_queries.join(' · ')}
                    </div>
                    {s.last_run_at ? (
                      <div className="text-xs text-muted-foreground">
                        Последний запуск: {s.last_run_at}
                        {s.last_status ? ` · ${s.last_status}` : ''}
                        {s.last_error ? ` — ${s.last_error}` : ''}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Ещё не запускалось по расписанию</div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleToggleSchedule(s.id, s.enabled)}
                    >
                      {s.enabled ? 'Отключить' : 'Включить'}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDeleteSchedule(s.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : !schedulesLoading ? (
            <p className="text-sm text-muted-foreground">Пока нет записей расписания.</p>
          ) : null}

          <form onSubmit={handleCreateSchedule} className="space-y-4 border-t border-border/60 pt-6">
            <h3 className="text-sm font-medium">Добавить расписание</h3>
            <p className="text-xs text-muted-foreground">
              Параметры выборки (лимиты, годы, исключения DOI) берутся из формы «Периодический дайджест» выше.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sch-profile">profile_id</Label>
                <Input
                  id="sch-profile"
                  value={schProfileId}
                  onChange={(e) => setSchProfileId(e.target.value)}
                  placeholder="как в форме выше"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sch-preset">Шаблон времени (UTC)</Label>
                <select
                  id="sch-preset"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  value={schPreset}
                  onChange={(e) => {
                    const id = e.target.value
                    setSchPreset(id)
                    const p = CRON_PRESETS.find((x) => x.id === id)
                    if (p?.cron) setSchCron(p.cron)
                  }}
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sch-cron">crontab (UTC)</Label>
              <Input
                id="sch-cron"
                value={schCron}
                onChange={(e) => {
                  setSchCron(e.target.value)
                  setSchPreset('custom')
                }}
                placeholder="0 6 1 * *"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="sch-topics">Темы (по одной строке)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSchTopicText(topics.filter((t) => t.trim()).join('\n'))}
                >
                  Взять из формы выше
                </Button>
              </div>
              <Textarea
                id="sch-topics"
                value={schTopicText}
                onChange={(e) => setSchTopicText(e.target.value)}
                rows={3}
              />
            </div>
            <Button type="submit" disabled={schSubmitting} variant="secondary">
              {schSubmitting ? 'Сохранение…' : 'Сохранить расписание'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Результат</h2>
          <p className="mt-1 text-xs text-muted-foreground/90">Дайджест, метаданные и структурированные тренды</p>
        </div>
        {!loading && !data && !error ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-muted/15 px-4 py-3 text-sm text-muted-foreground print:hidden">
            После запуска здесь будет дайджест RU/EN, мета периода и блок структурированных изменений относительно
            предыдущего сохранённого снимка.
          </p>
        ) : null}
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
