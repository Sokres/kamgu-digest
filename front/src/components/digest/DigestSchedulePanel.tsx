import { useCallback, useEffect, useRef, useState } from 'react'

import { profileDisplayName } from '@/components/ProfileDirectionPicker'
import { ScheduleUtcTimeFields } from '@/components/ScheduleUtcTimeFields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  ApiError,
  createDigestSchedule,
  deleteDigestSchedule,
  fetchDigestSchedules,
  fetchScheduleRuns,
  patchDigestSchedule,
} from '@/lib/api'
import type { DigestFormState } from '@/hooks/useDigestFormState'
import {
  parseDois,
  parseWebExtraTerms,
  parseYear,
  validateSharedLimits,
  validateTrendTopK,
} from '@/lib/digestFormParse'
import {
  SCHEDULE_PRESETS,
  buildCronUtc,
  describeCronFields,
  formatUtcTime24,
  inferScheduleFromCron,
  parseFixedHourMinute,
  type ScheduleFrequencyId,
} from '@/lib/scheduleLabels'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { DigestScheduleRunOut, DigestSchedulesListResponse, TrendProfileSummary } from '@/types/api'

type DigestSchedulePanelProps = {
  apiBase: string
  form: DigestFormState
  trendProfiles: TrendProfileSummary[]
  profileId: string
}

export function DigestSchedulePanel({
  apiBase,
  form,
  trendProfiles,
  profileId,
}: DigestSchedulePanelProps) {
  const [digestSchedules, setDigestSchedules] = useState<DigestSchedulesListResponse | null>(null)
  const [schedulesLoading, setSchedulesLoading] = useState(false)
  const [schedulesError, setSchedulesError] = useState<string | null>(null)
  const [schSubmitting, setSchSubmitting] = useState(false)
  const initialSch = inferScheduleFromCron('0 6 1 * *')
  const [schPreset, setSchPreset] = useState<ScheduleFrequencyId>(
    initialSch.frequency === 'custom' ? 'monthly' : initialSch.frequency,
  )
  const [schHourUtc, setSchHourUtc] = useState(initialSch.hour)
  const [schMinuteUtc, setSchMinuteUtc] = useState(initialSch.minute)
  const [schWeekday, setSchWeekday] = useState(initialSch.weekday)
  const [schCron, setSchCron] = useState(() =>
    buildCronUtc(
      initialSch.frequency === 'custom' ? 'monthly' : initialSch.frequency,
      initialSch.hour,
      initialSch.minute,
      initialSch.weekday,
    ),
  )
  const [schTopicText, setSchTopicText] = useState('')
  const [runsPanelScheduleId, setRunsPanelScheduleId] = useState<string | null>(null)
  const [runsRows, setRunsRows] = useState<DigestScheduleRunOut[] | null>(null)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  const internalKeyRef = useRef(form.internalKeyField)
  internalKeyRef.current = form.internalKeyField

  function scheduleInternalKey() {
    return internalKeyRef.current.trim() || getMonthlyInternalKey()
  }

  const loadSchedulesList = useCallback(async () => {
    setSchedulesLoading(true)
    setSchedulesError(null)
    try {
      const res = await fetchDigestSchedules(apiBase, { internalKey: scheduleInternalKey() })
      setDigestSchedules(res)
    } catch (err) {
      setDigestSchedules(null)
      setSchedulesError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
    } finally {
      setSchedulesLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    void loadSchedulesList()
  }, [loadSchedulesList])

  useEffect(() => {
    setRunsPanelScheduleId(null)
    setRunsRows(null)
  }, [profileId])

  const profileSchedules =
    profileId && digestSchedules?.items.length
      ? digestSchedules.items.filter((s) => s.profile_id === profileId)
      : []
  const otherSchedulesCount =
    profileId && digestSchedules?.items.length
      ? digestSchedules.items.filter((s) => s.profile_id !== profileId).length
      : 0

  const selectedProfile = trendProfiles.find((p) => p.profile_id === profileId)
  const profileLabel = profileId
    ? profileDisplayName(
        selectedProfile ?? {
          profile_id: profileId,
          snapshot_count: 0,
          topic_queries: [],
          work_count_last: 0,
        },
      )
    : ''

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSchedulesError(null)
    const queries = schTopicText.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    if (!queries.length) {
      const fromForm = form.topicQueriesFromLines()
      if (!fromForm.length) {
        setSchedulesError('Укажите темы в расписании или в общих параметрах поиска.')
        return
      }
    }
    const topicList = queries.length ? queries : form.topicQueriesFromLines()
    const pid = profileId.trim()
    if (!pid) {
      setSchedulesError('Сначала выберите или создайте направление выше.')
      return
    }
    const limits = validateSharedLimits(form.maxCandidates, form.topN)
    if (!limits.ok) {
      setSchedulesError(limits.message)
      return
    }
    const tk = validateTrendTopK(form.trendTopK)
    if (!tk.ok) {
      setSchedulesError(tk.message)
      return
    }
    const cron = schCron.trim()
    if (!cron) {
      setSchedulesError('Укажите расписание (cron, UTC).')
      return
    }
    setSchSubmitting(true)
    try {
      const extras = parseWebExtraTerms(form.webExtraTerms)
      await createDigestSchedule(
        apiBase,
        {
          profile_id: pid,
          cron_utc: cron,
          enabled: true,
          topic_queries: topicList,
          digest_mode: form.digestMode,
          web_scholarly_sources_only: form.digestMode === 'web_snippets' ? form.webScholarlyOnly : undefined,
          web_search_additional_terms:
            form.digestMode === 'web_snippets' && extras.length ? extras : undefined,
          max_candidates: limits.maxCandidates,
          top_n_for_llm: limits.topN,
          trend_top_k: tk.value,
          from_year: parseYear(form.fromYear),
          to_year: parseYear(form.toYear),
          exclude_dois: parseDois(form.excludeDois),
          fetch_oa_fulltext: form.fetchOaFulltext,
          deep_digest: form.deepDigest,
        },
        { internalKey: scheduleInternalKey() },
      )
      await loadSchedulesList()
    } catch (err) {
      setSchedulesError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
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
      setSchedulesError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!window.confirm('Удалить это расписание?')) return
    setSchedulesError(null)
    try {
      await deleteDigestSchedule(apiBase, id, { internalKey: scheduleInternalKey() })
      await loadSchedulesList()
    } catch (err) {
      setSchedulesError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
    }
  }

  async function toggleScheduleRuns(sid: string) {
    if (runsPanelScheduleId === sid) {
      setRunsPanelScheduleId(null)
      return
    }
    setRunsPanelScheduleId(sid)
    setRunsLoading(true)
    setRunsError(null)
    setRunsRows(null)
    try {
      const rows = await fetchScheduleRuns(apiBase, sid, { internalKey: scheduleInternalKey() })
      setRunsRows(rows)
    } catch (err) {
      setRunsError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setRunsLoading(false)
    }
  }

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Расписание для направления</CardTitle>
            <CardDescription className="text-pretty mt-1 max-w-2xl">
              {profileId ? (
                <>
                  Автозапуск снимка для «<span className="font-medium text-foreground">{profileLabel}</span>».
                  Параметры поиска — из общего блока выше; у каждого направления своё расписание.
                </>
              ) : (
                <>Выберите направление выше — затем можно задать автозапуск по времени (UTC на сервере).</>
              )}
            </CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={schedulesLoading} onClick={() => void loadSchedulesList()}>
            {schedulesLoading ? 'Загрузка…' : 'Обновить список'}
          </Button>
        </div>
        {digestSchedules ? (
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant={digestSchedules.scheduler_enabled_in_config ? 'default' : 'secondary'}>
              настройка сервера: {digestSchedules.scheduler_enabled_in_config ? 'вкл' : 'выкл'}
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

        {!profileId ? (
          <Alert>
            <AlertDescription>Расписание привязано к направлению — выберите или создайте его в блоке «Разовый запуск снимка» выше.</AlertDescription>
          </Alert>
        ) : null}

        {profileId && otherSchedulesCount > 0 ? (
          <p className="text-xs text-muted-foreground">
            У других направлений ещё {otherSchedulesCount}{' '}
            {otherSchedulesCount === 1 ? 'запись' : otherSchedulesCount < 5 ? 'записи' : 'записей'} расписания (не
            показаны).
          </p>
        ) : null}

        {profileId && profileSchedules.length > 0 ? (
          <ul className="space-y-3 rounded-lg border border-border/80 bg-muted/10 p-3 text-sm">
            {profileSchedules.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 border-b border-border/50 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="font-medium break-words">
                      {(() => {
                        const hm = parseFixedHourMinute(s.cron_utc)
                        return hm ? `${formatUtcTime24(hm.hour, hm.minute)} UTC` : s.cron_utc
                      })()}{' '}
                      <Badge variant="outline" className="ml-1 align-middle text-[10px] font-normal">
                        {s.digest_mode === 'web_snippets' ? 'веб' : 'реценз.'}
                      </Badge>
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
                      <div className="text-xs text-muted-foreground">Ещё не запускалось</div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => void toggleScheduleRuns(s.id)}>
                      {runsPanelScheduleId === s.id ? 'Скрыть журнал' : 'Журнал'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleToggleSchedule(s.id, s.enabled)}>
                      {s.enabled ? 'Отключить' : 'Включить'}
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => void handleDeleteSchedule(s.id)}>
                      Удалить
                    </Button>
                  </div>
                </div>
                {runsPanelScheduleId === s.id ? (
                  <div className="rounded-md border border-border/60 bg-background p-3">
                    {runsLoading ? <p className="text-xs text-muted-foreground">Загрузка…</p> : null}
                    {runsError ? (
                      <Alert variant="destructive" className="mb-2 py-2">
                        <AlertDescription>{runsError}</AlertDescription>
                      </Alert>
                    ) : null}
                    {runsRows && runsRows.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[180px]">Время</TableHead>
                            <TableHead>Статус</TableHead>
                            <TableHead>Сообщение</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runsRows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs align-top">{r.finished_at}</TableCell>
                              <TableCell className="align-top text-xs">{r.status}</TableCell>
                              <TableCell className="max-w-[min(480px,70vw)] break-words text-xs align-top">
                                {r.message || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : !runsLoading ? (
                      <p className="text-xs text-muted-foreground">Записей нет.</p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : profileId && !schedulesLoading ? (
          <p className="text-sm text-muted-foreground">Для этого направления расписания пока нет.</p>
        ) : null}

        <form
          onSubmit={handleCreateSchedule}
          className="space-y-4 border-t border-border/60 pt-6"
        >
          <h3 className="text-sm font-medium">
            {profileId ? `Новое расписание для «${profileLabel}»` : 'Новое расписание'}
          </h3>
          <div className="space-y-2">
            <Label htmlFor="sch-preset">Как часто запускать</Label>
            <Select
              value={schPreset}
              onValueChange={(id) => {
                const freq = id as ScheduleFrequencyId
                setSchPreset(freq)
                if (freq !== 'custom') {
                  setSchCron(buildCronUtc(freq, schHourUtc, schMinuteUtc, schWeekday))
                }
              }}
            >
              <SelectTrigger id="sch-preset" className="h-auto min-h-10 w-full max-w-xl py-2 whitespace-normal">
                <SelectValue placeholder="Шаблон" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-w-[min(100vw-2rem,28rem)]">
                {SCHEDULE_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="whitespace-normal">
                    <span className="block font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ScheduleUtcTimeFields
            frequency={schPreset}
            hour={schHourUtc}
            minute={schMinuteUtc}
            weekday={schWeekday}
            cronPreview={schCron}
            onHourChange={(h) => {
              setSchHourUtc(h)
              if (schPreset !== 'custom') setSchCron(buildCronUtc(schPreset, h, schMinuteUtc, schWeekday))
            }}
            onMinuteChange={(m) => {
              setSchMinuteUtc(m)
              if (schPreset !== 'custom') setSchCron(buildCronUtc(schPreset, schHourUtc, m, schWeekday))
            }}
            onWeekdayChange={(d) => {
              setSchWeekday(d)
              if (schPreset !== 'custom') setSchCron(buildCronUtc(schPreset, schHourUtc, schMinuteUtc, d))
            }}
          />
          {schPreset === 'custom' ? (
            <div className="space-y-2">
              <Label htmlFor="sch-cron">Cron (UTC)</Label>
              <Input
                id="sch-cron"
                value={schCron}
                onChange={(e) => {
                  const next = e.target.value
                  setSchCron(next)
                  const inferred = inferScheduleFromCron(next)
                  if (inferred.frequency !== 'custom') {
                    setSchPreset(inferred.frequency)
                    setSchHourUtc(inferred.hour)
                    setSchMinuteUtc(inferred.minute)
                    setSchWeekday(inferred.weekday)
                  }
                }}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{describeCronFields()}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="sch-topics">Темы (по одной строке)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSchTopicText(form.topicQueriesFromLines().join('\n'))}
              >
                Взять из общих параметров
              </Button>
            </div>
            <Textarea id="sch-topics" value={schTopicText} onChange={(e) => setSchTopicText(e.target.value)} rows={3} />
          </div>
          <Button type="submit" disabled={schSubmitting || !profileId} variant="secondary">
            {schSubmitting ? 'Сохранение…' : 'Сохранить расписание'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
