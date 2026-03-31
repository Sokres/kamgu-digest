import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, fetchTrendProfiles, fetchTrendSeries, putTrendProfileLabel } from '@/lib/api'
import { getMonthlyInternalKey } from '@/lib/settings'
import type { TrendProfileSummary, TrendSeriesPoint } from '@/types/api'
import { cn } from '@/lib/utils'

function profileTitle(p: TrendProfileSummary): string {
  const d = (p.display_name ?? '').trim()
  return d || p.profile_id
}

export function TrendsPage() {
  const { apiBase } = useOutletContext<{ apiBase: string }>()
  const [profiles, setProfiles] = useState<TrendProfileSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [points, setPoints] = useState<TrendSeriesPoint[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingSeries, setLoadingSeries] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [labelName, setLabelName] = useState('')
  const [labelNote, setLabelNote] = useState('')
  const [savingLabel, setSavingLabel] = useState(false)
  const [labelMsg, setLabelMsg] = useState<string | null>(null)

  const loadProfiles = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const list = await fetchTrendProfiles(apiBase)
      setProfiles(list)
      setSelectedId((prev) => prev ?? list[0]?.profile_id ?? null)
    } catch (e) {
      setProfiles([])
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingList(false)
    }
  }, [apiBase])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  useEffect(() => {
    if (!selectedId) {
      setPoints([])
      return
    }
    let cancelled = false
    setLoadingSeries(true)
    setError(null)
    fetchTrendSeries(apiBase, selectedId)
      .then((res) => {
        if (!cancelled) {
          setPoints(res.points)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPoints([])
          setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSeries(false)
      })
    return () => {
      cancelled = true
    }
  }, [apiBase, selectedId])

  const selectedProfile = profiles.find((p) => p.profile_id === selectedId)

  useEffect(() => {
    if (!selectedProfile) {
      if (selectedId) {
        setLabelName(selectedId)
        setLabelNote('')
      }
      return
    }
    setLabelName((selectedProfile.display_name ?? '').trim() || selectedProfile.profile_id)
    setLabelNote(selectedProfile.note ?? '')
  }, [selectedProfile, selectedId])

  const maxWork = Math.max(1, ...points.map((p) => p.work_count))

  async function handleSaveLabel(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setLabelMsg(null)
    setSavingLabel(true)
    try {
      await putTrendProfileLabel(
        apiBase,
        selectedId,
        { display_name: labelName.trim(), note: labelNote.trim() },
        { internalKey: getMonthlyInternalKey() },
      )
      setLabelMsg('Сохранено')
      await loadProfiles()
    } catch (err) {
      setLabelMsg(err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err))
    } finally {
      setSavingLabel(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="text-sm text-muted-foreground">
        Данные из ежемесячных снимков в БД (<code className="rounded bg-muted px-1 py-0.5 text-xs">digest_snapshots</code>
        ). Чем больше периодов вы накопите через «Ежемесячный», тем полнее график. Метрика: число работ в топе (
        <code className="rounded bg-muted px-1 py-0.5 text-xs">works</code> в снимке).
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Профили</CardTitle>
          <CardDescription>
            Каждый <code className="text-xs">profile_id</code> из ежемесячного дайджеста — отдельная линия на графике.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingList ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Пока нет снимков. Запустите{' '}
              <a className="font-medium text-primary underline-offset-4 hover:underline" href="/monthly">
                ежемесячный дайджест
              </a>{' '}
              с нужным <code className="text-xs">profile_id</code> — после сохранения снимка профиль появится здесь.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead className="hidden sm:table-cell">profile_id</TableHead>
                  <TableHead className="text-right">Снимков</TableHead>
                  <TableHead className="hidden md:table-cell">Последний период</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const active = p.profile_id === selectedId
                  return (
                    <TableRow
                      key={p.profile_id}
                      className={cn('cursor-pointer', active && 'bg-muted/50')}
                      onClick={() => setSelectedId(p.profile_id)}
                    >
                      <TableCell className="font-medium">{profileTitle(p)}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                        {p.profile_id}
                      </TableCell>
                      <TableCell className="text-right">{p.snapshot_count}</TableCell>
                      <TableCell className="hidden md:table-cell">{p.last_period}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void loadProfiles()} disabled={loadingList}>
            Обновить список
          </Button>
        </CardContent>
      </Card>

      {selectedId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Динамика
              {selectedProfile ? (
                <Badge variant="secondary" className="font-mono font-normal">
                  {selectedProfile.profile_id}
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-mono font-normal">
                  {selectedId}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Изменение размера топа работ по сравнению с прошлым сохранённым периодом (месяц).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingSeries ? (
              <p className="text-sm text-muted-foreground">Загрузка ряда…</p>
            ) : points.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет точек для этого профиля.</p>
            ) : (
              <>
                <div className="flex h-48 items-end gap-1 sm:gap-2" aria-hidden>
                  {points.map((p) => {
                    const h = Math.max(4, (p.work_count / maxWork) * 100)
                    return (
                      <div
                        key={p.period}
                        className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                        title={`${p.period}: ${p.work_count}`}
                      >
                        <span className="text-[10px] font-medium tabular-nums text-foreground">{p.work_count}</span>
                        <div className="flex w-full flex-1 items-end rounded-t-md bg-muted/80">
                          <div
                            className="w-full rounded-t-md bg-primary/85 transition-all"
                            style={{ height: `${h}%` }}
                          />
                        </div>
                        <span className="max-w-full truncate text-center text-[10px] text-muted-foreground">
                          {p.period}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Период</TableHead>
                      <TableHead className="text-right">Работ в топе</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Δ к прошлому</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Δ %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {points.map((p) => (
                      <TableRow key={p.period}>
                        <TableCell className="font-mono text-sm">{p.period}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.work_count}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {p.delta_vs_prev == null ? '—' : p.delta_vs_prev > 0 ? `+${p.delta_vs_prev}` : String(p.delta_vs_prev)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {p.pct_change_vs_prev == null ? '—' : `${p.pct_change_vs_prev > 0 ? '+' : ''}${p.pct_change_vs_prev}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            <form className="space-y-3 border-t border-border/60 pt-6" onSubmit={handleSaveLabel}>
              <p className="text-sm font-medium">Подпись в интерфейсе</p>
              <p className="text-xs text-muted-foreground">
                Сохраняется в БД. Если задан <code className="text-[10px]">MONTHLY_DIGEST_CRON_SECRET</code>, нужен тот же{' '}
                <code className="text-[10px]">X-Internal-Key</code>, что и для ежемесячного дайджеста (см. Настройки).
              </p>
              <div className="grid gap-2">
                <Label htmlFor="trend-label-name">Отображаемое имя</Label>
                <Input
                  id="trend-label-name"
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  placeholder="Например: ВИЭ и сети"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="trend-label-note">Заметка</Label>
                <Textarea
                  id="trend-label-note"
                  value={labelNote}
                  onChange={(e) => setLabelNote(e.target.value)}
                  rows={2}
                  placeholder="Опционально"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm" disabled={savingLabel || !labelName.trim()}>
                  {savingLabel ? 'Сохранение…' : 'Сохранить подпись'}
                </Button>
                {labelMsg ? <span className="text-sm text-muted-foreground">{labelMsg}</span> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
