import { useEffect, useMemo, useState } from 'react'

import { profileDisplayName } from '@/components/ProfileDirectionPicker'
import { ScheduleFormFields } from '@/components/digest/ScheduleFormFields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DigestFormState } from '@/hooks/useDigestFormState'
import { useScheduleForm } from '@/hooks/useScheduleForm'
import {
  ApiError,
  createDigestSchedule,
  deleteDigestSchedule,
  fetchScheduleRuns,
  patchDigestSchedule,
} from '@/lib/api'
import {
  resolveScheduleParams,
  toScheduleCreateBody,
  toSchedulePatchBody,
} from '@/lib/scheduleParams'
import { formatUtcTime24, parseFixedHourMinute, scheduleLocalHint } from '@/lib/scheduleLabels'
import {
  scheduleLastStatusIsFailure,
  scheduleLastStatusLabel,
  scheduleLastStatusVariant,
} from '@/lib/scheduleStatusBadge'
import type {
  DigestScheduleRunOut,
  DigestSchedulesListResponse,
  PeriodicDigestScheduleOut,
  TrendProfileSummary,
} from '@/types/api'

type DigestSchedulePanelProps = {
  apiBase: string
  form: DigestFormState
  trendProfiles: TrendProfileSummary[]
  profileId: string
  digestSchedules: DigestSchedulesListResponse | null
  schedulesLoading: boolean
  schedulesError: string | null
  setSchedulesError: (msg: string | null) => void
  onReloadSchedules: () => Promise<void>
  scheduleInternalKey: () => string
}

function pickLatestRun(
  items: PeriodicDigestScheduleOut[],
): { at: string; status: string | null; error: string | null } | null {
  let best: { at: string; status: string | null; error: string | null } | null = null
  for (const schedule of items) {
    if (!schedule.last_run_at) continue
    if (!best || schedule.last_run_at > best.at) {
      best = {
        at: schedule.last_run_at,
        status: schedule.last_status ?? null,
        error: schedule.last_error ?? null,
      }
    }
  }
  return best
}

function scheduleTimeLabel(cron: string): string {
  const hm = parseFixedHourMinute(cron)
  return hm ? `${formatUtcTime24(hm.hour, hm.minute)} UTC` : 'Своё расписание'
}

export function DigestSchedulePanel({
  apiBase,
  form,
  trendProfiles,
  profileId,
  digestSchedules,
  schedulesLoading,
  schedulesError,
  setSchedulesError,
  onReloadSchedules,
  scheduleInternalKey,
}: DigestSchedulePanelProps) {
  const createForm = useScheduleForm()
  const editForm = useScheduleForm()

  const [schSubmitting, setSchSubmitting] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<PeriodicDigestScheduleOut | null>(null)
  const [editEnabled, setEditEnabled] = useState(true)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [runsPanelScheduleId, setRunsPanelScheduleId] = useState<string | null>(null)
  const [runsRows, setRunsRows] = useState<DigestScheduleRunOut[] | null>(null)
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  const profileSchedules = useMemo(
    () =>
      profileId && digestSchedules?.items.length
        ? digestSchedules.items.filter((s) => s.profile_id === profileId)
        : [],
    [digestSchedules?.items, profileId],
  )

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

  const snapshotTopics = selectedProfile?.topic_queries ?? []
  const enabledCount = profileSchedules.filter((s) => s.enabled).length
  const primarySchedule = profileSchedules.find((s) => s.enabled) ?? profileSchedules[0] ?? null
  const latestRun = pickLatestRun(profileSchedules)
  const schedulerOff = digestSchedules && !digestSchedules.scheduler_enabled_in_config

  useEffect(() => {
    setRunsPanelScheduleId(null)
    setRunsRows(null)
  }, [profileId])

  useEffect(() => {
    const failed = profileSchedules.find((s) => scheduleLastStatusIsFailure(s.last_status))
    if (failed) {
      setRunsPanelScheduleId(failed.id)
      setRunsLoading(true)
      setRunsError(null)
      void fetchScheduleRuns(apiBase, failed.id, { internalKey: scheduleInternalKey() })
        .then(setRunsRows)
        .catch((err) =>
          setRunsError(
            err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
          ),
        )
        .finally(() => setRunsLoading(false))
    }
  }, [apiBase, profileId, profileSchedules, scheduleInternalKey])

  function openEditSheet(s: PeriodicDigestScheduleOut) {
    setEditingSchedule(s)
    setEditEnabled(s.enabled)
    editForm.resetFromCron(s.cron_utc, s.topic_queries.join('\n'))
    setEditError(null)
  }

  function closeEditSheet() {
    setEditingSchedule(null)
    setEditError(null)
  }

  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault()
    setSchedulesError(null)
    const pid = profileId.trim()
    if (!pid) {
      setSchedulesError('Сначала выберите или создайте направление выше.')
      return
    }
    const resolved = resolveScheduleParams(form, createForm.fields)
    if (!resolved.ok) {
      setSchedulesError(resolved.message)
      return
    }
    setSchSubmitting(true)
    try {
      await createDigestSchedule(
        apiBase,
        toScheduleCreateBody(pid, resolved, true),
        { internalKey: scheduleInternalKey() },
      )
      createForm.setTopicText('')
      await onReloadSchedules()
    } catch (err) {
      setSchedulesError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
    } finally {
      setSchSubmitting(false)
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSchedule) return
    setEditError(null)
    const resolved = resolveScheduleParams(form, editForm.fields)
    if (!resolved.ok) {
      setEditError(resolved.message)
      return
    }
    setEditSubmitting(true)
    try {
      await patchDigestSchedule(
        apiBase,
        editingSchedule.id,
        toSchedulePatchBody(resolved, editEnabled),
        { internalKey: scheduleInternalKey() },
      )
      closeEditSheet()
      await onReloadSchedules()
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
    } finally {
      setEditSubmitting(false)
    }
  }

  function applySharedParamsToEdit() {
    editForm.setTopicText(form.topicQueriesFromLines().join('\n'))
  }

  async function handleToggleSchedule(id: string, enabled: boolean) {
    setSchedulesError(null)
    try {
      await patchDigestSchedule(apiBase, id, { enabled: !enabled }, { internalKey: scheduleInternalKey() })
      await onReloadSchedules()
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
      if (runsPanelScheduleId === id) {
        setRunsPanelScheduleId(null)
        setRunsRows(null)
      }
      await onReloadSchedules()
    } catch (err) {
      setSchedulesError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err),
      )
    }
  }

  async function openScheduleRuns(sid: string) {
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

  function renderScheduleItem(s: PeriodicDigestScheduleOut) {
    const timeLabel = scheduleTimeLabel(s.cron_utc)
    return (
      <li key={s.id} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-background/70 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-medium break-words">
              <span>{timeLabel}</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {s.digest_mode === 'web_snippets' ? 'веб' : 'реценз.'}
              </Badge>
              {!s.enabled ? (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  выкл
                </Badge>
              ) : null}
              {s.last_status ? (
                <Badge variant={scheduleLastStatusVariant(s.last_status)} className="text-[10px] font-normal">
                  {scheduleLastStatusLabel(s.last_status)}
                </Badge>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">{scheduleLocalHint(s.cron_utc)}</div>
            <div className="text-xs text-muted-foreground break-all">{s.topic_queries.join(' · ')}</div>
            {s.last_run_at ? (
              <div className="text-xs text-muted-foreground">
                Последний запуск: {s.last_run_at}
                {s.last_error ? ` — ${s.last_error}` : ''}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Ещё не запускалось</div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openEditSheet(s)}>
              Изменить
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => void openScheduleRuns(s.id)}>
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
    )
  }

  const totalSchedules = digestSchedules?.items.length ?? 0

  return (
    <>
      <Card id="schedule" className="scroll-mt-24 border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Автомониторинг</CardTitle>
              <CardDescription className="text-pretty mt-1 max-w-2xl">
                {profileId ? (
                  <>
                    Автоматически создаёт снимки для «<span className="font-medium text-foreground">{profileLabel}</span>»
                    и пополняет тренды без ручного запуска.
                  </>
                ) : (
                  <>Выберите направление выше — затем можно включить регулярный мониторинг.</>
                )}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={schedulesLoading}
              onClick={() => void onReloadSchedules()}
            >
              {schedulesLoading ? 'Загрузка…' : 'Обновить список'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {schedulesError ? (
            <Alert variant="destructive">
              <AlertDescription>{schedulesError}</AlertDescription>
            </Alert>
          ) : null}

          {!profileId ? (
            <Alert>
              <AlertDescription>
                Автомониторинг привязан к направлению — выберите или создайте его в блоке «Снимок» выше.
              </AlertDescription>
            </Alert>
          ) : null}

          {profileId ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/75 bg-muted/15 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Состояние</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">
                  {enabledCount > 0 ? 'Включён' : profileSchedules.length > 0 ? 'На паузе' : 'Не настроен'}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {enabledCount > 0
                    ? `${enabledCount} активн. распис.`
                    : profileSchedules.length > 0
                      ? 'Все расписания выключены'
                      : 'Можно включить ниже'}
                </p>
              </div>
              <div className="rounded-lg border border-border/75 bg-muted/15 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Частота</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">
                  {primarySchedule ? scheduleTimeLabel(primarySchedule.cron_utc) : '—'}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {primarySchedule ? scheduleLocalHint(primarySchedule.cron_utc) : 'Время появится после настройки'}
                </p>
              </div>
              <div className="rounded-lg border border-border/75 bg-muted/15 p-4">
                <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Последний запуск</div>
                <div className="mt-2 text-xl font-semibold tracking-tight">
                  {latestRun ? scheduleLastStatusLabel(latestRun.status) : '—'}
                </div>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {latestRun ? latestRun.at : 'Ещё не запускалось'}
                </p>
              </div>
            </div>
          ) : null}

          {latestRun?.error ? (
            <Alert variant="destructive">
              <AlertDescription className="break-words text-sm">{latestRun.error}</AlertDescription>
            </Alert>
          ) : null}

          {schedulerOff ? (
            <Alert>
              <AlertDescription className="text-pretty text-sm">
                Планировщик на сервере выключен. Детали доступны в диагностике ниже.
              </AlertDescription>
            </Alert>
          ) : null}

          <details className="group rounded-lg border border-border/80 bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
              <span>{profileSchedules.length ? 'Настроить автомониторинг' : 'Включить автомониторинг'}</span>
              <span className="text-xs text-muted-foreground group-open:hidden">частота, время, темы</span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">Скрыть</span>
            </summary>
            <form onSubmit={handleCreateSchedule} className="space-y-4 border-t border-border/60 p-4">
              <ScheduleFormFields
                idPrefix="sch-create"
                fields={createForm.fields}
                onPresetChange={createForm.setPreset}
                onHourChange={createForm.setHourUtc}
                onMinuteChange={createForm.setMinuteUtc}
                onWeekdayChange={createForm.setWeekday}
                onCronChange={createForm.setCron}
                onTopicTextChange={createForm.setTopicText}
                onTopicsFromShared={() => createForm.setTopicText(form.topicQueriesFromLines().join('\n'))}
                onTopicsFromSnapshot={
                  snapshotTopics.length
                    ? () => createForm.setTopicText(snapshotTopics.join('\n'))
                    : undefined
                }
                snapshotTopicsAvailable={snapshotTopics.length > 0}
              />
              <Button type="submit" disabled={schSubmitting || !profileId} variant="secondary">
                {schSubmitting ? 'Сохранение…' : 'Сохранить автомониторинг'}
              </Button>
            </form>
          </details>

          {profileId && profileSchedules.length > 0 ? (
            <details className="group rounded-lg border border-border/80 bg-background/55">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                <span>Расписания и журнал</span>
                <span className="text-xs text-muted-foreground group-open:hidden">
                  {profileSchedules.length} запис.
                </span>
                <span className="hidden text-xs text-muted-foreground group-open:inline">Скрыть</span>
              </summary>
              <ul className="space-y-3 border-t border-border/60 p-4 text-sm">
                {profileSchedules.map(renderScheduleItem)}
              </ul>
            </details>
          ) : null}

          {totalSchedules > 0 ? (
            <details className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-sm">
              <summary className="cursor-pointer py-1 font-medium">Диагностика ({totalSchedules})</summary>
              {digestSchedules ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                  <Badge variant={digestSchedules.scheduler_enabled_in_config ? 'default' : 'secondary'}>
                    конфиг: {digestSchedules.scheduler_enabled_in_config ? 'вкл' : 'выкл'}
                  </Badge>
                  <Badge variant={digestSchedules.scheduler_running ? 'default' : 'outline'}>
                    процесс: {digestSchedules.scheduler_running ? 'запущен' : 'не запущен'}
                  </Badge>
                </div>
              ) : null}
              <ul className="mt-3 space-y-2 border-t border-border/50 pt-3">
                {digestSchedules?.items.map((s) => {
                  const prof = trendProfiles.find((p) => p.profile_id === s.profile_id)
                  const name = prof ? profileDisplayName(prof) : s.profile_id
                  const hm = parseFixedHourMinute(s.cron_utc)
                  const timeLabel = hm ? `${formatUtcTime24(hm.hour, hm.minute)} UTC` : s.cron_utc
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span className="min-w-0 break-words">
                        <span className="font-medium text-foreground">{name}</span>
                        {' · '}
                        {timeLabel}
                        {!s.enabled ? ' · выкл' : ''}
                        {s.last_status ? ` · ${scheduleLastStatusLabel(s.last_status)}` : ''}
                      </span>
                      {s.profile_id !== profileId ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0"
                          onClick={() => form.setSelectedProfileId(s.profile_id)}
                        >
                          Выбрать
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide">текущее</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Sheet open={!!editingSchedule} onOpenChange={(open) => !open && closeEditSheet()}>
        <SheetContent className="flex flex-col sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Изменить расписание</SheetTitle>
            <SheetDescription className="font-mono text-xs break-all">
              {editingSchedule?.cron_utc}
            </SheetDescription>
          </SheetHeader>
          <form className="flex flex-1 flex-col gap-4 py-4" onSubmit={handleSaveEdit}>
            <ScheduleFormFields
              idPrefix="sch-edit"
              fields={editForm.fields}
              enabled={editEnabled}
              showEnabled
              onEnabledChange={setEditEnabled}
              onPresetChange={editForm.setPreset}
              onHourChange={editForm.setHourUtc}
              onMinuteChange={editForm.setMinuteUtc}
              onWeekdayChange={editForm.setWeekday}
              onCronChange={editForm.setCron}
              onTopicTextChange={editForm.setTopicText}
              onTopicsFromShared={() => editForm.setTopicText(form.topicQueriesFromLines().join('\n'))}
              onTopicsFromSnapshot={
                snapshotTopics.length
                  ? () => editForm.setTopicText(snapshotTopics.join('\n'))
                  : undefined
              }
              snapshotTopicsAvailable={snapshotTopics.length > 0}
            />
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={applySharedParamsToEdit}>
              Подставить темы и лимиты из общих параметров
            </Button>
            {editError ? (
              <Alert variant="destructive">
                <AlertDescription>{editError}</AlertDescription>
              </Alert>
            ) : null}
            <SheetFooter className="mt-auto gap-2 sm:justify-between px-0">
              <Button type="button" variant="outline" onClick={closeEditSheet}>
                Отмена
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
